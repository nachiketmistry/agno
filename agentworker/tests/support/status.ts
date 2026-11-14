/**
 * Progress report: runs each suite and prints how much of the specification passes.
 * `bun run status` from the workspace root. Exit code is always 0; this is a report.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..", "..");
const suites: Array<[name: string, cwd: string, args: string[]]> = [
  ["contract unit", "packages/contract", []],
  ["core unit", "packages/core", []],
  ["server unit", "packages/server", []],
  ["conformance (HTTP contract)", "tests", ["conformance"]],
  ["behaviour (HTTP scenarios)", "tests", ["behavior"]],
];

const report: Record<string, { pass: number; fail: number }> = {};
for (const [name, cwd, args] of suites) {
  const run = Bun.spawnSync(["bun", "test", ...args], {
    cwd: join(root, cwd),
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = run.stdout.toString() + run.stderr.toString();
  const count = (word: string) => Number(output.match(new RegExp(`(\\d+) ${word}`))?.[1] ?? 0);
  report[name] = { pass: count("pass"), fail: count("fail") };
}

const target = process.env.AGENTWORKER_BASE_URL ?? "TypeScript app, in process";
console.log(`Target for the HTTP suites: ${target}\n`);
let pass = 0;
let total = 0;
for (const [name, result] of Object.entries(report)) {
  const sum = result.pass + result.fail;
  pass += result.pass;
  total += sum;
  console.log(`${name.padEnd(30)} ${String(result.pass).padStart(4)} / ${String(sum).padEnd(4)} pass`);
}
console.log(
  `${"total".padEnd(30)} ${String(pass).padStart(4)} / ${String(total).padEnd(4)} pass (${((100 * pass) / total).toFixed(1)}%)`,
);
writeFileSync(join(root, "status.json"), `${JSON.stringify({ target, report }, null, 2)}\n`);
