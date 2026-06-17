import type { AcceptedCredential } from "@token/config/tokens.js";
import { getTokenConfig } from "@token/config/tokens.js";
import { signWithKms } from "@token/services/signing.service.js";
import { getWalletForSigning } from "@token/services/wallet.service.js";
import { extractTxHash, getClient } from "@token/services/xrpl.service.js";
import { type TxResponse, convertStringToHex, encodeForSigning } from "xrpl";

export const CREDENTIAL_TYPE_KYC_JAPAN = "KYC_JAPAN";
export const CREDENTIAL_TYPE_KYC_JAPAN_HEX = convertStringToHex("KYC_JAPAN");

export async function issueCredential(userAddress: string, credentialType: string): Promise<string> {
  const xrplClient = await getClient();
  const { issuerAddress, kmsKeyPath, signingPublicKey } = getTokenConfig("JPYN");

  const tx = {
    TransactionType: "CredentialCreate" as const,
    Account: issuerAddress,
    Subject: userAddress,
    CredentialType: credentialType,
  };

  const prepared = await xrplClient.autofill(tx);
  (prepared as Record<string, unknown>).SigningPubKey = signingPublicKey;
  const encodedTx = encodeForSigning(prepared);
  const signature = await signWithKms(Buffer.from(encodedTx, "hex"), kmsKeyPath);

  const result: TxResponse = await xrplClient.submitAndWait({
    ...prepared,
    TxnSignature: signature,
  });

  return extractTxHash(result);
}

export async function acceptCredential(
  bipIndex: number,
  userAddress: string,
  issuerAddress: string,
  credentialType: string,
): Promise<string> {
  const xrplClient = await getClient();
  const wallet = getWalletForSigning(bipIndex);

  const tx = {
    TransactionType: "CredentialAccept" as const,
    Account: userAddress,
    Issuer: issuerAddress,
    CredentialType: credentialType,
  };

  const prepared = await xrplClient.autofill(tx);
  const signed = wallet.sign(prepared);
  const result: TxResponse = await xrplClient.submitAndWait(signed.tx_blob);

  return extractTxHash(result);
}

export async function revokeCredential(userAddress: string, credentialType: string): Promise<string> {
  const xrplClient = await getClient();
  const { issuerAddress, kmsKeyPath, signingPublicKey } = getTokenConfig("JPYN");

  const tx = {
    TransactionType: "CredentialDelete" as const,
    Account: issuerAddress,
    Subject: userAddress,
    CredentialType: credentialType,
  };

  const prepared = await xrplClient.autofill(tx);
  (prepared as Record<string, unknown>).SigningPubKey = signingPublicKey;
  const encodedTx = encodeForSigning(prepared);
  const signature = await signWithKms(Buffer.from(encodedTx, "hex"), kmsKeyPath);

  const result: TxResponse = await xrplClient.submitAndWait({
    ...prepared,
    TxnSignature: signature,
  });

  return extractTxHash(result);
}

export async function getCredentialStatus(
  userAddress: string,
  issuerAddress: string,
  credentialType: string,
): Promise<{ exists: boolean; accepted: boolean; expiration?: number }> {
  const xrplClient = await getClient();

  try {
    const response = await xrplClient.request({
      command: "ledger_entry",
      credential: {
        subject: userAddress,
        issuer: issuerAddress,
        credential_type: credentialType,
      },
    } as unknown as Parameters<typeof xrplClient.request>[0]);

    const result = response.result as Record<string, unknown>;
    const node = result.node as Record<string, unknown> | undefined;
    if (!node) {
      return { exists: false, accepted: false };
    }

    const accepted = !!((node.Flags as number) & 0x00010000); // lsfAccepted
    return {
      exists: true,
      accepted,
      expiration: node.Expiration as number | undefined,
    };
  } catch (error: unknown) {
    const err = error as { data?: { error?: string } };
    if (err.data?.error === "entryNotFound") {
      return { exists: false, accepted: false };
    }
    throw error;
  }
}

// Ripple epoch (2000-01-01) offset in unix seconds; XRPL Expiration is in this epoch.
const RIPPLE_EPOCH_OFFSET = 946684800;

function isExpired(expiration: number | undefined, nowUnixSeconds: number): boolean {
  if (expiration === undefined) return false;
  return expiration + RIPPLE_EPOCH_OFFSET <= nowUnixSeconds;
}

/**
 * Whether the holder satisfies at least one of the token's accepted credentials,
 * i.e. holds an accepted (and non-expired) credential of a matching issuer + type.
 *
 * This is the application-layer KYC gate: until the MPToken DomainID path is available
 * on-chain (requires SingleAssetVault), credential enforcement happens here, before the
 * issuer authorizes a holder.
 */
export async function holderHasAcceptedCredential(
  holderAddress: string,
  acceptedCredentials: AcceptedCredential[],
): Promise<boolean> {
  const nowUnixSeconds = Math.floor(Date.now() / 1000);
  for (const { issuer, credentialType } of acceptedCredentials) {
    const status = await getCredentialStatus(holderAddress, issuer, credentialType);
    if (status.exists && status.accepted && !isExpired(status.expiration, nowUnixSeconds)) {
      return true;
    }
  }
  return false;
}
