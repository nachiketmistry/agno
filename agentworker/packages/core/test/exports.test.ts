import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as core from "../src/index";
import * as testing from "../src/testing";

const testSources = readdirSync(import.meta.dir)
  .filter((file) => file.endsWith(".test.ts") && file !== "exports.test.ts")
  .map((file) => readFileSync(join(import.meta.dir, file), "utf8"))
  .join("\n");

/**
 * The guard behind "every core function has a test": adding an export without a
 * test that names it fails here.
 */
describe("every export of the core is named in a unit test", () => {
  for (const name of [...Object.keys(core), ...Object.keys(testing)].sort()) {
    test(name, () => {
      expect(new RegExp(`\\b${name}\\b`).test(testSources)).toBe(true);
    });
  }
});
