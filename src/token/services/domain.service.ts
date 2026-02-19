import type { AcceptedCredential } from "@token/config/tokens.js";
import { getTokenConfig } from "@token/config/tokens.js";
import { signWithKms } from "@token/services/signing.service.js";
import { getClient } from "@token/services/xrpl.service.js";
import { encodeForSigning, type SubmitResponse } from "xrpl";

interface AuthorizeCredential {
  Credential: { Issuer: string; CredentialType: string };
}

function toAuthorizeCredentials(accepted: AcceptedCredential[]): AuthorizeCredential[] {
  return accepted.map(({ issuer, credentialType }) => ({
    Credential: { Issuer: issuer, CredentialType: credentialType },
  }));
}

function extractTxHash(result: SubmitResponse): string {
  if (result.result.engine_result !== "tesSUCCESS") {
    throw new Error(`XRPL transaction failed: ${result.result.engine_result_message}`);
  }
  return result.result.tx_json?.hash ?? "";
}

async function signWithIssuer(xrplClient: any, tx: any): Promise<SubmitResponse> {
  const { kmsKeyPath, signingPublicKey } = getTokenConfig("JPYN");
  const prepared: any = await xrplClient.autofill(tx);
  prepared.SigningPubKey = signingPublicKey;
  const encodedTx = encodeForSigning(prepared);
  const signature = await signWithKms(Buffer.from(encodedTx, "hex"), kmsKeyPath);
  return xrplClient.submit({ ...prepared, TxnSignature: signature });
}

export async function createDomain(
  acceptedCredentials: AcceptedCredential[],
): Promise<{ txHash: string; domainId: string }> {
  const xrplClient = await getClient();
  const { issuerAddress } = getTokenConfig("JPYN");

  const tx: any = {
    TransactionType: "PermissionedDomainSet",
    Account: issuerAddress,
    AcceptedCredentials: toAuthorizeCredentials(acceptedCredentials),
  };

  const result = await signWithIssuer(xrplClient, tx);
  const txHash = extractTxHash(result);

  // The actual DomainID is in the metadata's CreatedNode
  const meta = (result.result as any).meta ?? (result.result as any).tx_json?.meta;
  let createdDomainId = "";
  if (meta?.AffectedNodes) {
    for (const node of meta.AffectedNodes) {
      if (node.CreatedNode?.LedgerEntryType === "PermissionedDomain") {
        createdDomainId = node.CreatedNode.LedgerIndex;
        break;
      }
    }
  }

  const sequence = (result.result.tx_json as any)?.Sequence;
  return { txHash, domainId: createdDomainId || `${issuerAddress}:${sequence}` };
}

export async function updateDomain(domainId: string, acceptedCredentials: AcceptedCredential[]): Promise<string> {
  const xrplClient = await getClient();
  const { issuerAddress } = getTokenConfig("JPYN");

  const tx: any = {
    TransactionType: "PermissionedDomainSet",
    Account: issuerAddress,
    DomainID: domainId,
    AcceptedCredentials: toAuthorizeCredentials(acceptedCredentials),
  };

  const result = await signWithIssuer(xrplClient, tx);
  return extractTxHash(result);
}

export async function deleteDomain(domainId: string): Promise<string> {
  const xrplClient = await getClient();
  const { issuerAddress } = getTokenConfig("JPYN");

  const tx: any = {
    TransactionType: "PermissionedDomainDelete",
    Account: issuerAddress,
    DomainID: domainId,
  };

  const result = await signWithIssuer(xrplClient, tx);
  return extractTxHash(result);
}

export async function getDomainInfo(domainId: string): Promise<any> {
  const xrplClient = await getClient();

  try {
    const response = await xrplClient.request({
      command: "ledger_entry",
      index: domainId,
    } as any);

    return (response.result as any).node ?? null;
  } catch (error: any) {
    if (error?.data?.error === "entryNotFound") {
      return null;
    }
    throw error;
  }
}
