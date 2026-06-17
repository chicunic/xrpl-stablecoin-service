import type { MPTokenMetadata } from "xrpl";
import { convertStringToHex } from "xrpl";

export interface AcceptedCredential {
  issuer: string;
  credentialType: string; // hex
}

export interface TokenConfig {
  tokenId: string;
  name: string;
  domain: string;
  issuerAddress: string;
  kmsKeyPath: string;
  signingPublicKey: string;
  mptIssuanceId: string;
  assetScale: number;
  maximumAmount: string;
  transferFee: number;
  mptMetadata?: MPTokenMetadata;
  permissionedDomainId?: string;
  acceptedCredentials: AcceptedCredential[];
}

const TOKEN_CONFIGS: Record<string, TokenConfig> = {
  JPYN: {
    tokenId: "JPYN",
    name: "JPYN",
    domain: "nexbridge.dev",
    issuerAddress: "rpPqDaWncvBULqLLZULS4svoi1fxW4sPjp",
    kmsKeyPath: process.env.JPYN_KMS_KEY_PATH ?? "",
    signingPublicKey: "ED9CBF796AF94F722DE72A56FFD44E2239E92151A593BE69E51FDF86DDEA04EEE5",
    mptIssuanceId: process.env.JPYN_MPT_ISSUANCE_ID ?? "",
    assetScale: 0,
    maximumAmount: "100000000",
    transferFee: 0,
    mptMetadata: {
      ticker: "JPYN",
      name: "JPYN Stablecoin",
      desc: "JPY-backed stablecoin issued on XRPL",
      icon: "https://nexbridge.dev/jpyn-icon.png",
      asset_class: "rwa",
      asset_subclass: "stablecoin",
      issuer_name: "NexBridge",
    },
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

/**
 * Test-only: override a token config at runtime (used by localnet integration tests
 * to inject a freshly-created issuer / domain / issuance). Never called in production.
 */
export function __setTokenConfigForTest(tokenId: string, overrides: Partial<TokenConfig>): void {
  const existing = TOKEN_CONFIGS[tokenId];
  if (!existing) {
    throw new Error(`Unknown token: ${tokenId}`);
  }
  TOKEN_CONFIGS[tokenId] = { ...existing, ...overrides };
}
