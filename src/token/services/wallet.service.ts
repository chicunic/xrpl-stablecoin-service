import { getFirestore } from "@common/config/firebase.js";
import { Wallet } from "xrpl";

const MNEMONIC_SECRET_PATH = process.env.MNEMONIC_SECRET_PATH;

let cachedMnemonic: string | null = null;

async function getMnemonic(): Promise<string> {
  if (cachedMnemonic) {
    return cachedMnemonic;
  }

  if (!MNEMONIC_SECRET_PATH) {
    throw new Error("MNEMONIC_SECRET_PATH is not configured");
  }

  const { SecretManagerServiceClient } = await import("@google-cloud/secret-manager");
  const secretClient = new SecretManagerServiceClient();

  const [version] = await secretClient.accessSecretVersion({
    name: MNEMONIC_SECRET_PATH,
  });

  const payload = version.payload?.data;
  if (!payload) {
    throw new Error("Failed to retrieve mnemonic from Secret Manager");
  }

  cachedMnemonic = typeof payload === "string" ? payload : new TextDecoder().decode(payload as Uint8Array);
  return cachedMnemonic;
}

function derivationPath(index: number): string {
  return `m/44'/144'/0'/0/${index}`;
}

async function deriveFullWallet(index: number): Promise<Wallet> {
  const mnemonic = await getMnemonic();
  return Wallet.fromMnemonic(mnemonic, { derivationPath: derivationPath(index) });
}

export async function deriveWallet(index: number): Promise<{ address: string; publicKey: string }> {
  const wallet = await deriveFullWallet(index);
  return { address: wallet.address, publicKey: wallet.publicKey };
}

export async function getWalletForSigning(index: number): Promise<Wallet> {
  return deriveFullWallet(index);
}

export async function allocateXrpAddressIndex(): Promise<number> {
  const db = getFirestore();
  const counterRef = db.collection("token_counters").doc("bipIndex");

  return db.runTransaction(async (tx) => {
    const counterDoc = await tx.get(counterRef);
    const current = counterDoc.exists ? (counterDoc.data()?.value as number) : 0;
    const next = current + 1;
    tx.set(counterRef, { value: next });
    return next;
  });
}
