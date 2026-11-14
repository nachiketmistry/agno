import { type AppOptions, createApp } from "./app";

export const REFERENCE_OS_ID = "reference-os";

/**
 * The same OS the Python reference builds in `reference/python/reference_os.py`:
 * agent `assistant`, team `crew`, workflow `echo-flow` and CompanyOS on. The
 * conformance and behaviour suites run against either one.
 */
export function createReferenceApp(overrides: Partial<AppOptions> = {}) {
  return createApp({
    osId: REFERENCE_OS_ID,
    name: "Reference OS",
    description: "Reference AgentOS for the AgentWorker contract",
    ...overrides,
  });
}
