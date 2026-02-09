import dotenv from "dotenv";

dotenv.config();

import { getTokenConfig } from "@token/config/tokens.js";
import { getPublicKey, signWithKms } from "@token/services/kms-sm.service.js";
import { deriveAddress, verify } from "ripple-keypairs";
import type { AccountSet } from "xrpl";
import { encodeForSigning, Wallet } from "xrpl";
import ECDSA from "xrpl/dist/npm/ECDSA.js";

const SEED = "snhkEU556dW9AzJKCEFfoyayewvjv";
const SECRET_PATH = "projects/nexbridge-486208/secrets/xrpl-issuer-seed/versions/latest";
const tokenConfig = getTokenConfig("JPYN");

async function main() {
  const wallet = Wallet.fromSeed(SEED, { algorithm: ECDSA.ed25519 });
  console.log("Wallet address:", wallet.address);
  console.log("Wallet publicKey:", wallet.publicKey);

  // 1. Verify getPublicKey matches
  const pubKey = await getPublicKey(SECRET_PATH);
  const derivedAddress = deriveAddress(pubKey);
  console.log("\n=== Public Key ===");
  console.log("getPublicKey():", pubKey);
  console.log("wallet.publicKey:", wallet.publicKey.toUpperCase());
  console.log("Match:", pubKey === wallet.publicKey.toUpperCase());

  console.log("\n=== Address ===");
  console.log("Derived address:", derivedAddress);
  console.log("wallet.address: ", wallet.address);
  console.log("Config issuerAddress:", tokenConfig.issuerAddress);
  console.log("Wallet match:", derivedAddress === wallet.address);
  console.log("Config match:", derivedAddress === tokenConfig.issuerAddress);

  if (pubKey !== wallet.publicKey.toUpperCase() || derivedAddress !== tokenConfig.issuerAddress) {
    console.error("\nFAILED: SM key does not match tokens.ts config");
    process.exit(1);
  }

  // 2. Build a test transaction
  const tx: AccountSet = {
    TransactionType: "AccountSet",
    Account: wallet.address,
    Sequence: 1,
    Fee: "12",
    SigningPubKey: wallet.publicKey.toUpperCase(),
  };

  // 3. Verify encoded transaction raw data is identical
  const encodedTx = encodeForSigning(tx);
  console.log("\n=== Transaction Raw Data ===");
  console.log("encodeForSigning:", encodedTx);

  // 4. Sign with kms-sm and with Wallet.sign(), compare
  const kmsDevSignature = await signWithKms(Buffer.from(encodedTx, "hex"), SECRET_PATH);
  const walletSigned = wallet.sign(tx);

  console.log("\n=== Signatures ===");
  console.log("kms-sm signature:", kmsDevSignature);
  console.log("wallet signature: ", walletSigned.tx_blob);

  // 5. Verify kms-sm signature is valid
  const isValid = verify(encodedTx, kmsDevSignature, wallet.publicKey);
  console.log("\n=== Verification ===");
  console.log("kms-sm signature valid:", isValid);

  if (!isValid) {
    console.error("\nFAILED: kms-sm signature is invalid");
    process.exit(1);
  }

  console.log("\nPASSED: all checks OK");
  process.exit(0);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
