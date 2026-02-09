type SignFn = (message: Uint8Array, keyPath: string) => Promise<string>;
type GetPublicKeyFn = (keyPath: string) => Promise<string>;

let _signWithKms: SignFn | null = null;
let _getPublicKey: GetPublicKeyFn | null = null;

async function load(): Promise<{ signWithKms: SignFn; getPublicKey: GetPublicKeyFn }> {
  if (_signWithKms && _getPublicKey) {
    return { signWithKms: _signWithKms, getPublicKey: _getPublicKey };
  }

  const provider = process.env.SIGNING_PROVIDER ?? "sm";

  if (provider === "kms") {
    const mod = await import("./kms.service.js");
    _signWithKms = mod.signWithKms;
    _getPublicKey = mod.getPublicKey;
  } else {
    const mod = await import("./kms-sm.service.js");
    _signWithKms = mod.signWithKms;
    _getPublicKey = mod.getPublicKey;
  }

  return { signWithKms: _signWithKms, getPublicKey: _getPublicKey };
}

export async function signWithKms(message: Uint8Array, keyPath: string): Promise<string> {
  const { signWithKms: fn } = await load();
  return fn(message, keyPath);
}

export async function getPublicKey(keyPath: string): Promise<string> {
  const { getPublicKey: fn } = await load();
  return fn(keyPath);
}
