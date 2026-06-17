import { Wallet } from "xrpl";

function getMnemonic(): string {
  const mnemonic = process.env.MNEMONIC;
  if (!mnemonic) {
    throw new Error("MNEMONIC is not configured");
  }
  return mnemonic;
}

function derivationPath(index: number): string {
  return `m/44'/144'/0'/0/${String(index)}`;
}

function deriveFullWallet(index: number): Wallet {
  const mnemonic = getMnemonic();
  return Wallet.fromMnemonic(mnemonic, { derivationPath: derivationPath(index) });
}

export function deriveWallet(index: number): { address: string; publicKey: string } {
  const wallet = deriveFullWallet(index);
  return { address: wallet.address, publicKey: wallet.publicKey };
}

export function getWalletForSigning(index: number): Wallet {
  return deriveFullWallet(index);
}
