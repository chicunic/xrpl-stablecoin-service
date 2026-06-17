import type { TokenConfig } from "@token/config/tokens.js";
import { signWithKms } from "@token/services/signing.service.js";
import { getWalletForSigning } from "@token/services/wallet.service.js";
import type {
  Clawback,
  MPTokenAuthorize,
  MPTokenIssuanceCreate,
  MPTokenIssuanceDestroy,
  MPTokenIssuanceSet,
  Payment,
  SubmittableTransaction,
  TransactionMetadata,
  TxResponse,
} from "xrpl";
import { Client, MPTokenIssuanceCreateFlags, encodeForSigning, encodeMPTokenMetadata } from "xrpl";
import type { MPToken } from "xrpl/dist/npm/models/ledger";

const network = process.env.XRPL_NETWORK ?? "testnet";
const XRPL_URL =
  process.env.XRPL_ENDPOINT ??
  (network === "mainnet"
    ? "wss://xrplcluster.com"
    : network === "devnet"
      ? "wss://s.devnet.rippletest.net:51233"
      : network === "localnet"
        ? "ws://localhost:6006"
        : "wss://s.altnet.rippletest.net:51233");

// JPYN issuance flags: full compliance capability set (no Trade/Escrow); DomainID requires tfMPTRequireAuth or temMALFORMED.
const JPYN_ISSUANCE_FLAGS =
  MPTokenIssuanceCreateFlags.tfMPTCanTransfer |
  MPTokenIssuanceCreateFlags.tfMPTCanLock |
  MPTokenIssuanceCreateFlags.tfMPTCanClawback |
  MPTokenIssuanceCreateFlags.tfMPTRequireAuth;

let client: Client | null = null;

export async function getClient(): Promise<Client> {
  if (!client?.isConnected()) {
    client = new Client(XRPL_URL);
    await client.connect();
  }
  return client;
}

export async function disconnect(): Promise<void> {
  if (client?.isConnected()) {
    await client.disconnect();
    client = null;
  }
}

/**
 * Validate a submitAndWait result and return its hash. Reads the FINAL on-ledger outcome
 * (`meta.TransactionResult`), not the provisional `engine_result` of a bare submit — so the
 * caller is guaranteed the transaction is validated before this returns.
 */
export function extractTxHash(result: TxResponse): string {
  const meta = result.result.meta;
  const txResult = typeof meta === "object" ? meta.TransactionResult : undefined;
  if (txResult !== "tesSUCCESS") {
    throw new Error(`XRPL transaction failed: ${txResult ?? "unknown"}`);
  }
  return result.result.hash;
}

/**
 * Sign with the issuer's KMS key and submit, waiting for ledger validation.
 * Returns the raw TxResponse so callers needing meta (e.g. createDomain) can inspect it.
 */
export async function signAndSubmitWithIssuer(
  tx: SubmittableTransaction,
  kmsKeyPath: string,
  signingPublicKey: string,
): Promise<TxResponse> {
  const xrplClient = await getClient();
  const prepared = await xrplClient.autofill(tx);
  (prepared as Record<string, unknown>).SigningPubKey = signingPublicKey;
  const encodedTx = encodeForSigning(prepared);
  const signature = await signWithKms(Buffer.from(encodedTx, "hex"), kmsKeyPath);
  return xrplClient.submitAndWait({ ...prepared, TxnSignature: signature });
}

async function submitWithIssuer(tx: SubmittableTransaction, config: TokenConfig): Promise<string> {
  const result = await signAndSubmitWithIssuer(tx, config.kmsKeyPath, config.signingPublicKey);
  return extractTxHash(result);
}

async function signAndSubmitWithWallet(xrpAddressIndex: number, tx: SubmittableTransaction): Promise<string> {
  const xrplClient = await getClient();
  const wallet = getWalletForSigning(xrpAddressIndex);

  const prepared = await xrplClient.autofill(tx);
  const signed = wallet.sign(prepared);
  const result = await xrplClient.submitAndWait(signed.tx_blob);

  return extractTxHash(result);
}

// === Issuer (KMS) operations ===

/**
 * Create the MPToken issuance. Uses submitAndWait to read mpt_issuance_id from meta.
 * Returns the new mpt_issuance_id.
 */
export async function createIssuance(config: TokenConfig): Promise<{ txHash: string; mptIssuanceId: string }> {
  const xrplClient = await getClient();

  // DomainID needs the SingleAssetVault amendment (not on mainnet → temDISABLED), so it's env-gated: ship today via tfMPTRequireAuth + app-layer KYC, set MPT_ENABLE_DOMAIN_ID=true once the amendment is live to enforce KYC on-chain.
  const enableDomainId = process.env.MPT_ENABLE_DOMAIN_ID === "true";
  const tx: MPTokenIssuanceCreate = {
    TransactionType: "MPTokenIssuanceCreate",
    Account: config.issuerAddress,
    AssetScale: config.assetScale,
    MaximumAmount: config.maximumAmount,
    TransferFee: config.transferFee,
    Flags: JPYN_ISSUANCE_FLAGS,
    ...(config.mptMetadata ? { MPTokenMetadata: encodeMPTokenMetadata(config.mptMetadata) } : {}),
    ...(enableDomainId && config.permissionedDomainId ? { DomainID: config.permissionedDomainId } : {}),
  };

  const prepared = await xrplClient.autofill(tx);
  prepared.SigningPubKey = config.signingPublicKey;
  const encodedTx = encodeForSigning(prepared);
  const signature = await signWithKms(Buffer.from(encodedTx, "hex"), config.kmsKeyPath);

  const result = await xrplClient.submitAndWait({ ...prepared, TxnSignature: signature });
  const meta = result.result.meta as TransactionMetadata & { mpt_issuance_id?: string };

  if (meta.TransactionResult !== "tesSUCCESS") {
    throw new Error(`MPTokenIssuanceCreate failed: ${meta.TransactionResult}`);
  }
  if (!meta.mpt_issuance_id) {
    throw new Error("MPTokenIssuanceCreate succeeded but mpt_issuance_id missing from meta");
  }

  return { txHash: result.result.hash, mptIssuanceId: meta.mpt_issuance_id };
}

/** Issuer approves a holder (required because tfMPTRequireAuth is set). */
export async function issuerAuthorize(
  holderAddress: string,
  mptIssuanceId: string,
  config: TokenConfig,
): Promise<string> {
  const tx: MPTokenAuthorize = {
    TransactionType: "MPTokenAuthorize",
    Account: config.issuerAddress,
    MPTokenIssuanceID: mptIssuanceId,
    Holder: holderAddress,
  };
  return submitWithIssuer(tx, config);
}

/** Mint tokens to a destination (issuer -> holder Payment). */
export async function mint(
  destination: string,
  mptIssuanceId: string,
  amount: string,
  config: TokenConfig,
): Promise<string> {
  const tx: Payment = {
    TransactionType: "Payment",
    Account: config.issuerAddress,
    Destination: destination,
    Amount: { mpt_issuance_id: mptIssuanceId, value: amount },
  };
  return submitWithIssuer(tx, config);
}

export async function clawback(
  holderAddress: string,
  mptIssuanceId: string,
  amount: string,
  config: TokenConfig,
): Promise<string> {
  const tx: Clawback = {
    TransactionType: "Clawback",
    Account: config.issuerAddress,
    Amount: { mpt_issuance_id: mptIssuanceId, value: amount },
    Holder: holderAddress,
  };
  return submitWithIssuer(tx, config);
}

/** Lock the whole issuance, or a single holder if provided. */
export async function lock(mptIssuanceId: string, config: TokenConfig, holderAddress?: string): Promise<string> {
  const tx: MPTokenIssuanceSet = {
    TransactionType: "MPTokenIssuanceSet",
    Account: config.issuerAddress,
    MPTokenIssuanceID: mptIssuanceId,
    ...(holderAddress ? { Holder: holderAddress } : {}),
    Flags: { tfMPTLock: true },
  };
  return submitWithIssuer(tx, config);
}

export async function unlock(mptIssuanceId: string, config: TokenConfig, holderAddress?: string): Promise<string> {
  const tx: MPTokenIssuanceSet = {
    TransactionType: "MPTokenIssuanceSet",
    Account: config.issuerAddress,
    MPTokenIssuanceID: mptIssuanceId,
    ...(holderAddress ? { Holder: holderAddress } : {}),
    Flags: { tfMPTUnlock: true },
  };
  return submitWithIssuer(tx, config);
}

/** Destroy the issuance (requires all holder balances = 0). */
export async function destroyIssuance(mptIssuanceId: string, config: TokenConfig): Promise<string> {
  const tx: MPTokenIssuanceDestroy = {
    TransactionType: "MPTokenIssuanceDestroy",
    Account: config.issuerAddress,
    MPTokenIssuanceID: mptIssuanceId,
  };
  return submitWithIssuer(tx, config);
}

// === Holder (local BIP wallet) operations ===

/** Holder opt-in (MPTokenAuthorize without Holder). */
export async function authorize(
  xrpAddressIndex: number,
  holderAddress: string,
  mptIssuanceId: string,
): Promise<string> {
  const tx: MPTokenAuthorize = {
    TransactionType: "MPTokenAuthorize",
    Account: holderAddress,
    MPTokenIssuanceID: mptIssuanceId,
  };
  return signAndSubmitWithWallet(xrpAddressIndex, tx);
}

/** Transfer tokens from a holder wallet to a destination. */
export async function transfer(
  xrpAddressIndex: number,
  fromAddress: string,
  destination: string,
  mptIssuanceId: string,
  amount: string,
): Promise<string> {
  const tx: Payment = {
    TransactionType: "Payment",
    Account: fromAddress,
    Destination: destination,
    Amount: { mpt_issuance_id: mptIssuanceId, value: amount },
  };
  return signAndSubmitWithWallet(xrpAddressIndex, tx);
}

/** Burn = transfer tokens back to the issuer. */
export async function burn(
  xrpAddressIndex: number,
  fromAddress: string,
  mptIssuanceId: string,
  amount: string,
  issuerAddress: string,
): Promise<string> {
  return transfer(xrpAddressIndex, fromAddress, issuerAddress, mptIssuanceId, amount);
}

export async function sendXrpFromUser(
  xrpAddressIndex: number,
  fromAddress: string,
  destination: string,
  amountDrops: string,
): Promise<string> {
  return signAndSubmitWithWallet(xrpAddressIndex, {
    TransactionType: "Payment",
    Account: fromAddress,
    Destination: destination,
    Amount: amountDrops,
  });
}

// === Read-only ===

// MPTAmount is omitted from the ledger object when a holder's balance is zero.
type MPTokenObject = Omit<MPToken, "MPTAmount"> & { MPTAmount?: string };

async function fetchMptObjects(address: string): Promise<MPTokenObject[]> {
  const xrplClient = await getClient();
  const response = await xrplClient.request({
    command: "account_objects",
    account: address,
    type: "mptoken",
  });
  // SDK types don't include MPToken in the AccountObject union — cast needed.
  return response.result.account_objects as unknown as MPTokenObject[];
}

export async function getMptBalance(address: string, mptIssuanceId: string): Promise<string> {
  const objects = await fetchMptObjects(address);
  const mpt = objects.find((obj) => obj.MPTokenIssuanceID === mptIssuanceId);
  return mpt?.MPTAmount ?? "0";
}

export async function getMptBalances(address: string): Promise<{ mptIssuanceId: string; value: string }[]> {
  const objects = await fetchMptObjects(address);
  return objects.map((obj) => ({
    mptIssuanceId: obj.MPTokenIssuanceID,
    value: obj.MPTAmount ?? "0",
  }));
}

/** Whether the holder has opted-in (MPToken object exists) for this issuance. */
export async function hasMptAuthorization(address: string, mptIssuanceId: string): Promise<boolean> {
  const objects = await fetchMptObjects(address);
  return objects.some((obj) => obj.MPTokenIssuanceID === mptIssuanceId);
}
