import { getTokenConfig } from "@token/config/tokens.js";
import { signWithKms } from "@token/services/signing.service.js";
import { getWalletForSigning } from "@token/services/wallet.service.js";
import { getClient } from "@token/services/xrpl.service.js";
import { type SubmitResponse, convertStringToHex, encodeForSigning } from "xrpl";

export const CREDENTIAL_TYPE_KYC_JAPAN = "KYC_JAPAN";
export const CREDENTIAL_TYPE_KYC_JAPAN_HEX = convertStringToHex("KYC_JAPAN");

function extractTxHash(result: SubmitResponse): string {
  if (result.result.engine_result !== "tesSUCCESS") {
    throw new Error(`XRPL transaction failed: ${result.result.engine_result_message}`);
  }
  return result.result.tx_json.hash ?? "";
}

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

  const result: SubmitResponse = await xrplClient.submit({
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
  const result: SubmitResponse = await xrplClient.submit(signed.tx_blob);

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

  const result: SubmitResponse = await xrplClient.submit({
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
