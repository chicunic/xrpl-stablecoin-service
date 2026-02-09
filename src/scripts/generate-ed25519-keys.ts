/**
 * Generate ed25519 issuer credentials from a seed.
 * Usage: npx tsx src/scripts/generate-ed25519-keys.ts [seed]
 *
 * If no seed is provided, a new random seed is generated.
 * Output: address, public key, and seed for use in tokens.ts config.
 */
import { Wallet } from "xrpl";
import ECDSA from "xrpl/dist/npm/ECDSA.js";

const seed = process.argv[2];

const wallet = seed ? Wallet.fromSeed(seed, { algorithm: ECDSA.ed25519 }) : Wallet.generate(ECDSA.ed25519);

console.log("Algorithm: ed25519");
console.log("Seed:", wallet.seed);
console.log("Address:", wallet.address);
console.log("Public Key:", wallet.publicKey.toUpperCase());
console.log("Private Key:", wallet.privateKey);
console.log("\nTokens.ts config snippet:");
console.log(`  issuerAddress: "${wallet.address}",`);
console.log(`  signingPublicKey: "${wallet.publicKey.toUpperCase()}",`);
