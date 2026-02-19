import { convertHexToString, convertStringToHex } from "xrpl";

export interface AcceptedCredential {
  issuer: string;
  credentialType: string; // hex
}

export interface TokenConfig {
  tokenId: string;
  name: string;
  currency: string;
  domain: string;
  issuerAddress: string;
  kmsKeyPath: string;
  signingPublicKey: string;
  permissionedDomainId?: string;
  acceptedCredentials: AcceptedCredential[];
}

const TOKEN_CONFIGS: Record<string, TokenConfig> = {
  JPYN: {
    tokenId: "JPYN",
    name: "JPYN",
    currency: "JPYN",
    domain: "nexbridge.dev",
    issuerAddress: "rpPqDaWncvBULqLLZULS4svoi1fxW4sPjp",
    kmsKeyPath: process.env.JPYN_KMS_KEY_PATH ?? "",
    signingPublicKey: "ED9CBF796AF94F722DE72A56FFD44E2239E92151A593BE69E51FDF86DDEA04EEE5",
    permissionedDomainId: process.env.JPYN_DOMAIN_ID ?? "",
    acceptedCredentials: [
      {
        issuer: "rpPqDaWncvBULqLLZULS4svoi1fxW4sPjp",
        credentialType: convertStringToHex("KYC_JAPAN"),
      },
    ],
  },
};

export function getTokenConfig(tokenId: string): TokenConfig {
  const config = TOKEN_CONFIGS[tokenId];
  if (!config) {
    throw new Error(`Unknown token: ${tokenId}`);
  }
  return config;
}

export function getAllTokenConfigs(): TokenConfig[] {
  return Object.values(TOKEN_CONFIGS);
}

export function toXrplCurrency(code: string): string {
  if (code.length === 3) return code;
  if (code.length > 3) return convertStringToHex(code).padEnd(40, "0");
  throw new Error(`Invalid currency code: "${code}" (must be >= 3 characters)`);
}

export function fromXrplCurrency(hex: string): string {
  if (hex.length === 3) return hex;
  if (hex.length === 40) return convertHexToString(hex).replace(/\0/g, "");
  return hex;
}
