import dotenv from "dotenv";

dotenv.config();

import { getTokenConfig } from "@token/config/tokens.js";
import { getPublicKey, signWithKms } from "@token/services/kms.service.js";
import { deriveAddress, verify } from "ripple-keypairs";
import type { AccountSet } from "xrpl";
import { encodeForSigning } from "xrpl";

const tokenConfig = getTokenConfig("JPYN");

async function main() {
  // 1. Get public key from KMS and verify config
  const pubKey = await getPublicKey(tokenConfig.kmsKeyPath);
  const address = deriveAddress(pubKey);
  console.log("=== Public Key ===");
  console.log("KMS public key:", pubKey);
  console.log("Config signingPublicKey:", tokenConfig.signingPublicKey);
  console.log("Match:", pubKey === tokenConfig.signingPublicKey);

  console.log("\n=== Address ===");
  console.log("Derived address:", address);
  console.log("Config issuerAddress:", tokenConfig.issuerAddress);
  console.log("Match:", address === tokenConfig.issuerAddress);

  if (pubKey !== tokenConfig.signingPublicKey || address !== tokenConfig.issuerAddress) {
    console.error("\nFAILED: KMS key does not match tokens.ts config");
    process.exit(1);
  }

  // 2. Build a test transaction
  const tx: AccountSet = {
    TransactionType: "AccountSet",
    Account: address,
    Sequence: 1,
    Fee: "12",
    SigningPubKey: pubKey,
  };

  // 3. Encode for signing
  const encodedTx = encodeForSigning(tx);
  console.log("\n=== Transaction Raw Data ===");
  console.log("encodeForSigning:", encodedTx);

  // 4. Sign with KMS
  const kmsSignature = await signWithKms(Buffer.from(encodedTx, "hex"), tokenConfig.kmsKeyPath);
  console.log("\n=== Signature ===");
  console.log("KMS signature:", kmsSignature);

  // 5. Verify signature
  const isValid = verify(encodedTx, kmsSignature, pubKey);
  console.log("\n=== Verification ===");
  console.log("KMS signature valid:", isValid);

  if (!isValid) {
    console.error("\nFAILED: KMS signature is invalid");
    process.exit(1);
  }

  console.log("\nPASSED: all checks OK");
  process.exit(0);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
