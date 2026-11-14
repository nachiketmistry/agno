/**
 * Writes an RS256 key pair to `.keys/` (gitignored). Start the reference server with the
 * public key as JWT_VERIFICATION_KEY; the auth tests sign with the private key.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateTestKeyPair } from "@agentworker/core/testing";

const dir = process.env.AGENTWORKER_KEYS_DIR ?? join(import.meta.dir, "..", "..", ".keys");
mkdirSync(dir, { recursive: true });
const pair = await generateTestKeyPair();
writeFileSync(join(dir, "public.pem"), pair.publicKeyPem);
writeFileSync(join(dir, "private.pem"), pair.privateKeyPem, { mode: 0o600 });
console.log(`Wrote ${join(dir, "public.pem")} and private.pem`);
