/**
 * Localnet integration helpers: fund accounts from the standalone rippled genesis account,
 * and bootstrap a JPYN issuer + permissioned domain + MPToken issuance, injecting the
 * results into the live token config so the real service functions operate on them.
 */
import { __setTokenConfigForTest, getTokenConfig } from "@token/config/tokens.js";
import {
  CREDENTIAL_TYPE_KYC_JAPAN_HEX,
  acceptCredential,
  issueCredential,
} from "@token/services/credential.service.js";
import { createDomain } from "@token/services/domain.service.js";
import { deriveWallet } from "@token/services/wallet.service.js";
import { createIssuance, getClient } from "@token/services/xrpl.service.js";
import type { AccountSet, Client, Payment, TransactionMetadata } from "xrpl";
import { Wallet, xrpToDrops } from "xrpl";
import ECDSA from "xrpl/dist/npm/ECDSA.js";

// Standalone rippled genesis account (secp256k1), funded at ledger genesis.
const GENESIS_SEED = "snoPBrXtMeMyMHUVTgbuqAfg1SUTb";

// Firestore emulator (see docker-compose.yaml); project id MUST match firebase.ts emulator init.
const FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "localhost:8080";
const FIRESTORE_PROJECT_ID = "demo-xrpl-stablecoin";

/** Wipe all documents from the Firestore emulator. Call in beforeEach for test isolation. */
export async function clearFirestore(): Promise<void> {
  const url = `http://${FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents`;
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(`Failed to clear Firestore emulator: ${String(res.status)} ${await res.text()}`);
  }
}

// Fixed mnemonic for deriving holder wallets in tests (matches wallet.service derivation path).
export const TEST_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

function genesisWallet(): Wallet {
  return Wallet.fromSeed(GENESIS_SEED, { algorithm: ECDSA.secp256k1 });
}

async function submitFromGenesis(client: Client, tx: Payment): Promise<void> {
  const genesis = genesisWallet();
  const prepared = await client.autofill(tx);
  const signed = genesis.sign(prepared);
  const result = await client.submitAndWait(signed.tx_blob);
  const meta = result.result.meta as TransactionMetadata | undefined;
  if (meta?.TransactionResult !== "tesSUCCESS") {
    throw new Error(`Genesis funding failed: ${String(meta?.TransactionResult)}`);
  }
}

/** Fund an address from the genesis account with the given XRP amount. */
export async function fundFromGenesis(address: string, amountXrp = "1000"): Promise<void> {
  const client = await getClient();
  await submitFromGenesis(client, {
    TransactionType: "Payment",
    Account: genesisWallet().address,
    Destination: address,
    Amount: xrpToDrops(amountXrp),
  });
}

export interface LocalnetSetup {
  issuer: Wallet;
  mptIssuanceId: string;
  domainId: string;
}

/** Resolve a freshly-created PermissionedDomain's LedgerIndex from the issuer's objects. */
async function resolveDomainId(client: Client, issuerAddress: string): Promise<string> {
  const response = await client.request({
    command: "account_objects",
    account: issuerAddress,
    type: "permissioned_domain",
  } as unknown as Parameters<Client["request"]>[0]);
  const objects = (response.result as { account_objects?: { index?: string; LedgerEntryType?: string }[] })
    .account_objects;
  const domain = objects?.find((o) => o.LedgerEntryType === "PermissionedDomain");
  if (!domain?.index) {
    throw new Error("No PermissionedDomain found on issuer account after createDomain");
  }
  return domain.index;
}

/**
 * Bootstrap the JPYN token on localnet:
 *   1. generate an ed25519 issuer, fund it, set TEST_ISSUER_SEED so KMS-sm signing uses it
 *   2. inject issuer address/pubkey into the JPYN config
 *   3. AccountSet (Domain + DefaultRipple) on the issuer
 *   4. create a permissioned domain via domain.service, inject its id
 *   5. create the MPToken issuance via xrpl.service, inject its id
 */
export async function bootstrapLocalnetToken(): Promise<LocalnetSetup> {
  const client = await getClient();

  // 1. Issuer wallet (ed25519, matching production signing algorithm).
  const issuer = Wallet.generate(ECDSA.ed25519);
  process.env.TEST_ISSUER_SEED = issuer.seed;
  await fundFromGenesis(issuer.address, "1000");

  // 2. Inject issuer identity into the JPYN config; clear any leftover domain/issuance ids.
  __setTokenConfigForTest("JPYN", {
    issuerAddress: issuer.address,
    signingPublicKey: issuer.publicKey.toUpperCase(),
    kmsKeyPath: "test-issuer-seed",
    permissionedDomainId: "",
    mptIssuanceId: "",
    acceptedCredentials: getTokenConfig("JPYN").acceptedCredentials.map((c) => ({
      issuer: issuer.address,
      credentialType: c.credentialType,
    })),
  });

  // 3. AccountSet: Domain + asfDefaultRipple (mirrors setup-issuer.ts).
  const config = getTokenConfig("JPYN");
  const accountSet: AccountSet = await client.autofill({
    TransactionType: "AccountSet",
    Account: issuer.address,
    Domain: Buffer.from(config.domain).toString("hex").toUpperCase(),
    SetFlag: 8, // asfDefaultRipple
  });
  const signedAccountSet = issuer.sign(accountSet);
  const accountSetResult = await client.submitAndWait(signedAccountSet.tx_blob);
  if ((accountSetResult.result.meta as TransactionMetadata).TransactionResult !== "tesSUCCESS") {
    throw new Error("Issuer AccountSet failed");
  }

  // 4. Permissioned domain (issuer-signed via KMS-sm bypass): exercised but NOT bound to the issuance — DomainID needs the SingleAssetVault amendment (off on mainnet), so KYC stays app-layer; createDomain uses submit (no meta), so resolve the id from objects.
  await createDomain(config.acceptedCredentials);
  const domainId = await resolveDomainId(client, issuer.address);

  // 5. MPToken issuance — issuer-signed, created WITHOUT DomainID (permissionedDomainId empty in config), with tfMPTRequireAuth.
  const { mptIssuanceId } = await createIssuance(getTokenConfig("JPYN"));

  // Record both ids in config now that the issuance exists.
  __setTokenConfigForTest("JPYN", { mptIssuanceId, permissionedDomainId: domainId });

  return { issuer, mptIssuanceId, domainId };
}

export interface LocalnetHolder {
  address: string;
  bipIndex: number;
}

/** Derive a holder wallet from TEST_MNEMONIC at the given bip index and fund it. */
export async function setupHolder(bipIndex: number, amountXrp = "100"): Promise<LocalnetHolder> {
  const { address } = deriveWallet(bipIndex);
  await fundFromGenesis(address, amountXrp);
  return { address, bipIndex };
}

/** Issue a KYC_JAPAN credential to the holder (issuer-signed) and have the holder accept it. */
export async function grantKycCredential(holder: LocalnetHolder): Promise<void> {
  const { issuerAddress } = getTokenConfig("JPYN");
  await issueCredential(holder.address, CREDENTIAL_TYPE_KYC_JAPAN_HEX);
  await acceptCredential(holder.bipIndex, holder.address, issuerAddress, CREDENTIAL_TYPE_KYC_JAPAN_HEX);
}
