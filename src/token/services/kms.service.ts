import { KeyManagementServiceClient } from "@google-cloud/kms";

const client = new KeyManagementServiceClient();

/**
 * Sign a message using Google Cloud KMS ed25519 key.
 * ed25519 signs raw data directly (no pre-hashing).
 * @param message - Raw transaction bytes to sign
 * @param kmsKeyPath - KMS key version resource path
 */
export async function signWithKms(message: Uint8Array, kmsKeyPath: string): Promise<string> {
  const [response] = await client.asymmetricSign({
    name: kmsKeyPath,
    data: Buffer.from(message),
  });

  if (!response.signature) {
    throw new Error("KMS signing failed: no signature returned");
  }

  const sig =
    response.signature instanceof Uint8Array
      ? response.signature
      : new Uint8Array(Buffer.from(response.signature as string, "base64"));

  return Buffer.from(sig).toString("hex").toUpperCase();
}

/**
 * Get the ed25519 public key from KMS in XRPL format (ED prefix + 32 bytes).
 * @param kmsKeyPath - KMS key version resource path
 */
export async function getPublicKey(kmsKeyPath: string): Promise<string> {
  const [publicKey] = await client.getPublicKey({
    name: kmsKeyPath,
  });

  if (!publicKey.pem) {
    throw new Error("KMS getPublicKey failed: no PEM returned");
  }

  const pemBody = publicKey.pem
    .replace("-----BEGIN PUBLIC KEY-----", "")
    .replace("-----END PUBLIC KEY-----", "")
    .replace(/\n/g, "");

  const derBytes = Buffer.from(pemBody, "base64");
  // ed25519 DER public key: the raw 32-byte key is the last 32 bytes
  const rawKey = derBytes.subarray(derBytes.length - 32);

  // XRPL ed25519 format: ED prefix + 32-byte raw public key
  const xrplKey = Buffer.alloc(33);
  xrplKey[0] = 0xed;
  rawKey.copy(xrplKey, 1);

  return xrplKey.toString("hex").toUpperCase();
}
