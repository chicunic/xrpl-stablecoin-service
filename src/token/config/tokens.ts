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
  JPYN: {
    tokenId: "JPYN",
    name: "JPYN",
    currency: "JPYN",
    domain: "nexbridge.dev",
    issuerAddress: "rJ8u2J3UoU9cK4LwZZe1rSXmbZmF3nwvQy",
    kmsKeyPath:
      "projects/nexbridge-486208/locations/us-central1/keyRings/xrpl-signing/cryptoKeys/jpyn-issuer-testnet/cryptoKeyVersions/1",
    signingPublicKey: "02F081705E404140E1D05A6B7B3A13103C1128EE84247CE5CF8518042E4B7A9FAD",
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
