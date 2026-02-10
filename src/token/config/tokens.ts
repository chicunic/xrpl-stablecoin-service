import { convertStringToHex } from "xrpl";

export interface TokenConfig {
  tokenId: string;
  name: string;
  currency: string;
  domain: string;
  issuerAddress: string;
  kmsKeyPath: string;
  signingPublicKey: string;
}

const TOKEN_CONFIGS: Record<string, TokenConfig> = {
  // kms config
  // JPYN: {
  //   tokenId: "JPYN",
  //   name: "JPYN",
  //   currency: "JPYN",
  //   domain: "nexbridge.dev",
  //   issuerAddress: "rn5ojQQQocq8hwyVz5HkVgFi3KHjHpSCgV",
  //   kmsKeyPath:
  //     "projects/nexbridge-486208/locations/us-central1/keyRings/xrpl-signing/cryptoKeys/jpyn-ed25519/cryptoKeyVersions/1",
  //   signingPublicKey: "EDAFC69A09FD2BD760973F7A3E3DC672DC1FD0A70270C3652A36664232FE0EFDE4",
  // },
  // sm config
  JPYN: {
    tokenId: "JPYN",
    name: "JPYN",
    currency: "JPYN",
    domain: "nexbridge.dev",
    issuerAddress: "rpPqDaWncvBULqLLZULS4svoi1fxW4sPjp",
    kmsKeyPath: "projects/nexbridge-486208/secrets/xrpl-issuer-seed/versions/latest",
    signingPublicKey: "ED9CBF796AF94F722DE72A56FFD44E2239E92151A593BE69E51FDF86DDEA04EEE5",
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
