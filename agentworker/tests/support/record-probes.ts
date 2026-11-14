/**
 * Records how the reference server answers a bare request to every contract operation.
 * Run against the Python reference:
 *   AGENTWORKER_BASE_URL=http://127.0.0.1:7777 AGENTWORKER_AUTH_BASE_URL=http://127.0.0.1:7778 \
 *     bun run tests/support/record-probes.ts
 * With the auth server set it also records what a valid token with no scopes gets.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { operations } from "@agentworker/contract";
import { type ProbeRecord, probeKey, probePath } from "./probes";
import { AUTH_BASE_URL, BASE_URL, auth, call } from "./target";

if (!BASE_URL) throw new Error("Set AGENTWORKER_BASE_URL to the Python reference server");

const records: Record<string, ProbeRecord> = {};
for (const operation of operations) {
  const result = await call(operation.method, probePath(operation));
  records[probeKey(operation)] = {
    status: result.status,
    ...(typeof result.body?.detail === "string" ? { detail: result.body.detail } : {}),
    contentType: result.headers.get("content-type"),
  };
}
const file = join(import.meta.dir, "..", "..", "packages", "contract", "fixtures", "operation_probes.json");
writeFileSync(file, `${JSON.stringify(records, null, 2)}\n`);
console.log(`Recorded ${Object.keys(records).length} probes to ${file}`);

if (AUTH_BASE_URL) {
  const target = await auth();
  const token = await target.token();
  const scoped: Record<string, ProbeRecord> = {};
  for (const operation of operations) {
    const result = await target.call(operation.method, probePath(operation), { token });
    scoped[probeKey(operation)] = {
      status: result.status,
      ...(typeof result.body?.detail === "string" ? { detail: result.body.detail } : {}),
      contentType: result.headers.get("content-type"),
    };
  }
  const scopedFile = join(
    import.meta.dir,
    "..",
    "..",
    "packages",
    "contract",
    "fixtures",
    "operation_scope_probes.json",
  );
  writeFileSync(scopedFile, `${JSON.stringify(scoped, null, 2)}\n`);
  console.log(`Recorded ${Object.keys(scoped).length} no-scope probes to ${scopedFile}`);
}
