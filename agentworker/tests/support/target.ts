import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { generateTestKeyPair, importPrivateKeyPem, signTestJwt } from "@agentworker/core/testing";
import { REFERENCE_OS_ID, createReferenceApp } from "@agentworker/server";

/**
 * Where the suites send requests.
 *
 * Unset, they call the TypeScript app in process. Set AGENTWORKER_BASE_URL to run the
 * same tests against any server, including the Python reference, which is how the
 * expectations in these suites were checked.
 */
export const BASE_URL = process.env.AGENTWORKER_BASE_URL?.replace(/\/$/, "");
/** A second server that has JWT authorization on. See tests/README.md. */
export const AUTH_BASE_URL = process.env.AGENTWORKER_AUTH_BASE_URL?.replace(/\/$/, "");
export const KEYS_DIR = process.env.AGENTWORKER_KEYS_DIR ?? join(import.meta.dir, "..", "..", ".keys");

/** When set, every request the suites make is appended here as `METHOD /path STATUS`. */
const COVERAGE_FILE = process.env.AGENTWORKER_COVERAGE_FILE;

export const OS_ID = REFERENCE_OS_ID;
export const CONTROL_PLANE_ORIGIN = "https://os.agno.com";

export interface CallOptions {
  json?: unknown;
  form?: Record<string, string>;
  /** A body sent exactly as given. */
  raw?: string;
  headers?: Record<string, string>;
  token?: string;
}

export interface CallResult {
  status: number;
  headers: Headers;
  text: string;
  // biome-ignore lint/suspicious/noExplicitAny: response bodies are checked field by field in the tests
  body: any;
}

type Fetcher = (path: string, init: RequestInit) => Promise<Response>;

function makeCaller(fetcher: Fetcher) {
  return async (method: string, path: string, options: CallOptions = {}): Promise<CallResult> => {
    const headers: Record<string, string> = { ...options.headers };
    let body: BodyInit | undefined;
    if (options.json !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(options.json);
    } else if (options.form) {
      const form = new FormData();
      for (const [key, value] of Object.entries(options.form)) form.set(key, value);
      body = form;
    }
    if (options.raw !== undefined) body = options.raw;
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    const response = await fetcher(path, { method, headers, body });
    // Feeds `bun run coverage`: which operations the suites exercised, and with what result.
    if (COVERAGE_FILE) appendFileSync(COVERAGE_FILE, `${method} ${path.split("?")[0]} ${response.status}\n`);
    const text = await response.text();
    let parsed: unknown = undefined;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = undefined;
    }
    return { status: response.status, headers: response.headers, text, body: parsed };
  };
}

function fetcherFor(
  baseUrl: string | undefined,
  app: () => { request: (path: string, init: RequestInit) => Response | Promise<Response> },
): Fetcher {
  if (baseUrl) return (path, init) => fetch(`${baseUrl}${path}`, init);
  const instance = app();
  return async (path, init) => instance.request(path, init);
}

/** Calls the open target (no authorization configured). */
export const call = makeCaller(fetcherFor(BASE_URL, () => createReferenceApp()));

export interface AuthTarget {
  call: ReturnType<typeof makeCaller>;
  /** Signs an RS256 token the target accepts. `aud` defaults to the OS id, `exp` to five minutes. */
  token: (claims?: Record<string, unknown>) => Promise<string>;
  /** Signs with a key the target does not trust. */
  foreignToken: (claims?: Record<string, unknown>) => Promise<string>;
}

let authTarget: Promise<AuthTarget> | undefined;

/**
 * The target with JWT authorization on. In process it gets a fresh key pair. Against a
 * remote server it reads the private key written by `bun run reference:keys`, whose
 * public half the server was started with.
 */
export function auth(): Promise<AuthTarget> {
  authTarget ??= (async () => {
    const foreign = await generateTestKeyPair();
    let privateKey: CryptoKey;
    let fetcher: Fetcher;
    if (BASE_URL || AUTH_BASE_URL) {
      if (!AUTH_BASE_URL)
        throw new Error("Set AGENTWORKER_AUTH_BASE_URL to a server started with JWT_VERIFICATION_KEY");
      privateKey = await importPrivateKeyPem(readFileSync(join(KEYS_DIR, "private.pem"), "utf8"));
      fetcher = fetcherFor(AUTH_BASE_URL, () => createReferenceApp());
    } else {
      const pair = await generateTestKeyPair();
      privateKey = pair.privateKey;
      fetcher = fetcherFor(undefined, () => createReferenceApp({ jwtVerificationKeys: [pair.publicKeyPem] }));
    }
    const sign =
      (key: CryptoKey) =>
      (claims: Record<string, unknown> = {}) => {
        const now = Math.floor(Date.now() / 1000);
        return signTestJwt(key, {
          sub: "user-1",
          aud: OS_ID,
          iat: now,
          exp: now + 300,
          scopes: [],
          ...claims,
        });
      };
    return { call: makeCaller(fetcher), token: sign(privateKey), foreignToken: sign(foreign.privateKey) };
  })();
  return authTarget;
}

/** True when the suites must skip auth tests: a remote target without an auth twin. */
export const AUTH_UNAVAILABLE = Boolean(BASE_URL) && !AUTH_BASE_URL;
