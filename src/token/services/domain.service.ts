import type { AcceptedCredential } from "@token/config/tokens.js";
import { getTokenConfig } from "@token/config/tokens.js";
import { signWithKms } from "@token/services/signing.service.js";
import { getClient } from "@token/services/xrpl.service.js";
import { type SubmitResponse, type SubmittableTransaction, encodeForSigning } from "xrpl";

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
  return result.result.tx_json.hash ?? "";
}

interface XrplClient {
  autofill: (tx: SubmittableTransaction) => Promise<SubmittableTransaction>;
  submit: (tx: string | SubmittableTransaction) => Promise<SubmitResponse>;
}

async function signWithIssuer(xrplClient: XrplClient, tx: Record<string, unknown>): Promise<SubmitResponse> {
  const { kmsKeyPath, signingPublicKey } = getTokenConfig("JPYN");
  const prepared = await xrplClient.autofill(tx as unknown as SubmittableTransaction);
  (prepared as Record<string, unknown>).SigningPubKey = signingPublicKey;
  const encodedTx = encodeForSigning(prepared);
  const signature = await signWithKms(Buffer.from(encodedTx, "hex"), kmsKeyPath);
  const signed = { ...prepared, TxnSignature: signature } as SubmittableTransaction;
  return xrplClient.submit(signed);
}

interface AffectedNode {
  CreatedNode?: {
    LedgerEntryType: string;
    LedgerIndex: string;
  };
}

interface TxMeta {
  AffectedNodes?: AffectedNode[];
}

interface TxJsonWithSequence {
  Sequence?: number;
  meta?: TxMeta;
}

export async function createDomain(
  acceptedCredentials: AcceptedCredential[],
): Promise<{ txHash: string; domainId: string }> {
  const xrplClient = await getClient();
  const { issuerAddress } = getTokenConfig("JPYN");

  const tx: Record<string, unknown> = {
    TransactionType: "PermissionedDomainSet",
    Account: issuerAddress,
    AcceptedCredentials: toAuthorizeCredentials(acceptedCredentials),
  };

  const result = await signWithIssuer(xrplClient, tx);
  const txHash = extractTxHash(result);

  // The actual DomainID is in the metadata's CreatedNode
  const txResult = result.result as Record<string, unknown>;
  const meta = (txResult.meta as TxMeta | undefined) ?? (txResult.tx_json as TxJsonWithSequence | undefined)?.meta;
  let createdDomainId = "";
  if (meta?.AffectedNodes) {
    for (const node of meta.AffectedNodes) {
      if (node.CreatedNode?.LedgerEntryType === "PermissionedDomain") {
        createdDomainId = node.CreatedNode.LedgerIndex;
        break;
      }
    }
  }

  const sequence = (result.result.tx_json as TxJsonWithSequence).Sequence;
  return { txHash, domainId: createdDomainId || `${issuerAddress}:${String(sequence ?? "")}` };
}

export async function updateDomain(domainId: string, acceptedCredentials: AcceptedCredential[]): Promise<string> {
  const xrplClient = await getClient();
  const { issuerAddress } = getTokenConfig("JPYN");

  const tx: Record<string, unknown> = {
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

  const tx: Record<string, unknown> = {
    TransactionType: "PermissionedDomainDelete",
    Account: issuerAddress,
    DomainID: domainId,
  };

  const result = await signWithIssuer(xrplClient, tx);
  return extractTxHash(result);
}

interface DomainNode {
  [key: string]: unknown;
}

export async function getDomainInfo(domainId: string): Promise<DomainNode | null> {
  const xrplClient = await getClient();

  try {
    const response = await xrplClient.request({
      command: "ledger_entry",
      index: domainId,
    } as unknown as Parameters<typeof xrplClient.request>[0]);

    const result = response.result as Record<string, unknown>;
    return (result.node as DomainNode | undefined) ?? null;
  } catch (error: unknown) {
    const err = error as { data?: { error?: string } };
    if (err.data?.error === "entryNotFound") {
      return null;
    }
    throw error;
  }
}
