/** Test helpers: build RS256 keys and tokens with WebCrypto. Not used by the runtime. */

function base64Url(bytes: ArrayBuffer | Uint8Array | string): string {
  const data = typeof bytes === "string" ? new TextEncoder().encode(bytes) : new Uint8Array(bytes);
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pem(label: string, der: ArrayBuffer): string {
  const body = btoa(String.fromCharCode(...new Uint8Array(der)));
  return `-----BEGIN ${label}-----\n${body.match(/.{1,64}/g)!.join("\n")}\n-----END ${label}-----\n`;
}

export interface TestKeyPair {
  privateKey: CryptoKey;
  publicKeyPem: string;
  privateKeyPem: string;
}

export async function generateTestKeyPair(): Promise<TestKeyPair> {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  return {
    privateKey: pair.privateKey,
    publicKeyPem: pem("PUBLIC KEY", await crypto.subtle.exportKey("spki", pair.publicKey)),
    privateKeyPem: pem("PRIVATE KEY", await crypto.subtle.exportKey("pkcs8", pair.privateKey)),
  };
}

export async function importPrivateKeyPem(privateKeyPem: string): Promise<CryptoKey> {
  const body = privateKeyPem.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, [
    "sign",
  ]);
}

export async function signTestJwt(privateKey: CryptoKey, claims: Record<string, unknown>): Promise<string> {
  const signingInput = `${base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64Url(JSON.stringify(claims))}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64Url(signature)}`;
}
