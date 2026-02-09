import { sign as rippleSign } from "ripple-keypairs";
import { Wallet } from "xrpl";
import ECDSA from "xrpl/dist/npm/ECDSA.js";

let cachedWallet: Wallet | null = null;

async function getIssuerWallet(secretPath: string): Promise<Wallet> {
  if (cachedWallet) {
    return cachedWallet;
  }

  const { SecretManagerServiceClient } = await import("@google-cloud/secret-manager");
  const secretClient = new SecretManagerServiceClient();

  const [version] = await secretClient.accessSecretVersion({
    name: secretPath,
  });

  const payload = version.payload?.data;
  if (!payload) {
    throw new Error("Failed to retrieve issuer seed from Secret Manager");
  }

  const resolvedSeed = typeof payload === "string" ? payload : new TextDecoder().decode(payload as Uint8Array);
  cachedWallet = Wallet.fromSeed(resolvedSeed.trim(), { algorithm: ECDSA.ed25519 });
  return cachedWallet;
}

/**
 * Sign a message using the issuer wallet's ed25519 private key.
 * Drop-in replacement for kms.service.ts signWithKms.
 * @param message - Raw transaction bytes to sign
 * @param secretPath - Secret Manager resource path for the issuer seed
 */
export async function signWithKms(message: Uint8Array, secretPath: string): Promise<string> {
  const wallet = await getIssuerWallet(secretPath);
  const messageHex = Buffer.from(message).toString("hex");
  return rippleSign(messageHex, wallet.privateKey);
}

/**
 * Get the issuer wallet's ed25519 public key.
 * Drop-in replacement for kms.service.ts getPublicKey.
 * @param secretPath - Secret Manager resource path for the issuer seed
 */
export async function getPublicKey(secretPath: string): Promise<string> {
  const wallet = await getIssuerWallet(secretPath);
  return wallet.publicKey.toUpperCase();
}
