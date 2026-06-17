import type { AcceptedCredential } from "@token/config/tokens.js";
import { getTokenConfig } from "@token/config/tokens.js";
import { extractTxHash, getClient, signAndSubmitWithIssuer } from "@token/services/xrpl.service.js";
import type { SubmittableTransaction, TxResponse } from "xrpl";

interface AuthorizeCredential {
  Credential: { Issuer: string; CredentialType: string };
}

function toAuthorizeCredentials(accepted: AcceptedCredential[]): AuthorizeCredential[] {
  return accepted.map(({ issuer, credentialType }) => ({
    Credential: { Issuer: issuer, CredentialType: credentialType },
  }));
}

async function signWithIssuer(tx: Record<string, unknown>): Promise<TxResponse> {
  const { kmsKeyPath, signingPublicKey } = getTokenConfig("JPYN");
  return signAndSubmitWithIssuer(tx as unknown as SubmittableTransaction, kmsKeyPath, signingPublicKey);
}

interface AffectedNode {
  CreatedNode?: {
    LedgerEntryType: string;
    LedgerIndex: string;
  };
}

interface TxJsonWithSequence {
  Sequence?: number;
}

export async function createDomain(
  acceptedCredentials: AcceptedCredential[],
): Promise<{ txHash: string; domainId: string }> {
  const { issuerAddress } = getTokenConfig("JPYN");

  const tx: Record<string, unknown> = {
    TransactionType: "PermissionedDomainSet",
    Account: issuerAddress,
    AcceptedCredentials: toAuthorizeCredentials(acceptedCredentials),
  };

  const result = await signWithIssuer(tx);
  const txHash = extractTxHash(result);

  // The actual DomainID is in the validated metadata's CreatedNode.
  const meta = result.result.meta;
  const affectedNodes = typeof meta === "object" ? meta.AffectedNodes : undefined;
  let createdDomainId = "";
  for (const node of (affectedNodes as AffectedNode[] | undefined) ?? []) {
    if (node.CreatedNode?.LedgerEntryType === "PermissionedDomain") {
      createdDomainId = node.CreatedNode.LedgerIndex;
      break;
    }
  }

  const sequence = (result.result.tx_json as TxJsonWithSequence).Sequence;
  return { txHash, domainId: createdDomainId || `${issuerAddress}:${String(sequence ?? "")}` };
}

export async function updateDomain(domainId: string, acceptedCredentials: AcceptedCredential[]): Promise<string> {
  const { issuerAddress } = getTokenConfig("JPYN");

  const tx: Record<string, unknown> = {
    TransactionType: "PermissionedDomainSet",
    Account: issuerAddress,
    DomainID: domainId,
    AcceptedCredentials: toAuthorizeCredentials(acceptedCredentials),
  };

  const result = await signWithIssuer(tx);
  return extractTxHash(result);
}

export async function deleteDomain(domainId: string): Promise<string> {
  const { issuerAddress } = getTokenConfig("JPYN");

  const tx: Record<string, unknown> = {
    TransactionType: "PermissionedDomainDelete",
    Account: issuerAddress,
    DomainID: domainId,
  };

  const result = await signWithIssuer(tx);
  return extractTxHash(result);
}

type DomainNode = Record<string, unknown>;

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
