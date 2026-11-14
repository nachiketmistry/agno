import { notImplemented } from "./not-implemented";

export interface JwtVerifyOptions {
  /** PEM public keys (RS256) tried in order. */
  verificationKeys: string[];
  /** Expected audience: the OS id. When set, a token without a matching `aud` is rejected. */
  audience?: string | string[];
  algorithm?: "RS256";
  /** Seconds since the epoch; defaults to now. Lets tests pin time. */
  now?: number;
}

export interface JwtClaims {
  sub?: string;
  aud?: string | string[];
  exp?: number;
  scopes?: string[];
  [claim: string]: unknown;
}

export type JwtErrorCode =
  | "malformed"
  | "bad_signature"
  | "expired"
  | "missing_audience"
  | "invalid_audience";

export class JwtError extends Error {
  constructor(
    readonly code: JwtErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "JwtError";
  }
}

/** Verify an RS256 JWT and return its claims, or throw JwtError. */
export async function verifyJwt(_token: string, _options: JwtVerifyOptions): Promise<JwtClaims> {
  return notImplemented("verifyJwt");
}
