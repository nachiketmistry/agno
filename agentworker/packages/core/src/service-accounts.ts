import { notImplemented } from "./not-implemented";

/** Prefix makes tokens greppable for secret scanners. */
export const TOKEN_PREFIX = "agno_pat_";
/** Characters of the plaintext token kept for display: the prefix plus 7 random characters. */
export const TOKEN_DISPLAY_PREFIX_LENGTH = 16;
export const SERVICE_ACCOUNT_PRINCIPAL_PREFIX = "sa:";
export const DEFAULT_EXPIRY_DAYS = 90;
/** Run and read, nothing else. Anything broader requires an explicit request. */
export const DEFAULT_SERVICE_ACCOUNT_SCOPES: readonly string[] = [
  "agents:run",
  "teams:run",
  "workflows:run",
  "sessions:read",
  "config:read",
];

export interface GeneratedToken {
  plaintext: string;
  hash: string;
  displayPrefix: string;
}

/** A new opaque token: random, base62, returned once; only the SHA-256 hash is stored. */
export async function generateToken(): Promise<GeneratedToken> {
  return notImplemented("generateToken");
}

/** Lowercase hex SHA-256 of the plaintext token. */
export async function hashToken(_token: string): Promise<string> {
  return notImplemented("hashToken");
}

/** Lowercase slug, 1 to 63 characters, no colon, no leading underscore, no `@` or dot. */
export function isValidServiceAccountName(_name: string): boolean {
  return notImplemented("isValidServiceAccountName");
}

/** The principal a verified service account runs as: `sa:<name>`. */
export function serviceAccountPrincipal(_name: string): string {
  return notImplemented("serviceAccountPrincipal");
}

/** True for user ids in a reserved namespace that a JWT subject must never claim. */
export function isReservedPrincipal(_userId: unknown): boolean {
  return notImplemented("isReservedPrincipal");
}
