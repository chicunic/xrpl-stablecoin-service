import { createHash } from "node:crypto";
import { KeyManagementServiceClient } from "@google-cloud/kms";

const client = new KeyManagementServiceClient();

export async function signWithKms(message: Uint8Array, kmsKeyPath: string): Promise<string> {
  // XRPL uses SHA-512Half (first 32 bytes of SHA-512) for transaction signing.
  // Pass it as digest.sha256 since both are 32 bytes and KMS signs the digest directly.
  const sha512 = createHash("sha512").update(message).digest();
  const sha512Half = sha512.subarray(0, 32);

  const [response] = await client.asymmetricSign({
    name: kmsKeyPath,
    digest: { sha256: sha512Half },
  });

  if (!response.signature) {
    throw new Error("KMS signing failed: no signature returned");
  }

  const sig =
    response.signature instanceof Uint8Array
      ? response.signature
      : new Uint8Array(Buffer.from(response.signature as string, "base64"));

  return Buffer.from(sig).toString("hex");
}

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
  // secp256k1 uncompressed public key is the last 65 bytes of the DER (04 + X + Y)
  const uncompressed = derBytes.subarray(derBytes.length - 65);

  // Compress: prefix 02 (even Y) or 03 (odd Y) + X coordinate
  const lastByte = uncompressed[64];
  if (lastByte === undefined) {
    throw new Error("Invalid uncompressed public key: missing Y coordinate");
  }
  const prefix = (lastByte & 1) === 0 ? 0x02 : 0x03;
  const compressed = Buffer.alloc(33);
  compressed[0] = prefix;
  uncompressed.copy(compressed, 1, 1, 33);

  return Buffer.from(compressed).toString("hex").toUpperCase();
}
