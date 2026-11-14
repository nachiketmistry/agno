import { describe, expect, test } from "bun:test";
import { openapi } from "@agentworker/contract";
import addFormats from "ajv-formats";
import Ajv2020 from "ajv/dist/2020";
import { call } from "../support/target";

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema(openapi as object, "openapi");

function pointer(path: string, method: string, status: string): string {
  const escaped = path.replace(/~/g, "~0").replace(/\//g, "~1");
  return `openapi#/paths/${escaped}/${method}/responses/${status}/content/application~1json/schema`;
}

/** Read endpoints that answer 200 on the reference OS without any stored data. */
const READS: Array<[path: string, template?: string]> = [
  ["/health"],
  ["/info"],
  ["/config"],
  ["/agents"],
  ["/agents/assistant", "/agents/{agent_id}"],
  ["/teams"],
  ["/teams/crew", "/teams/{team_id}"],
  ["/workflows"],
  ["/workflows/echo-flow", "/workflows/{workflow_id}"],
  ["/sessions"],
  ["/sessions/filter-schema"],
  ["/memories"],
  ["/memory_topics"],
  ["/user_memory_stats"],
  ["/eval-runs"],
  ["/metrics"],
  ["/traces"],
  ["/traces/filter-schema"],
  ["/trace_session_stats"],
  ["/learnings"],
  ["/learnings/users"],
  ["/components"],
  ["/registry"],
  ["/schedules"],
  ["/schedules/agno-company-automation", "/schedules/{schedule_id}"],
  ["/approvals"],
  ["/approvals/count"],
  ["/service-accounts"],
  ["/filesystem/files"],
  ["/os/metrics/runs"],
  ["/os/metrics/sessions"],
  ["/os/metrics/tokens"],
  ["/os/metrics/latency"],
  ["/os/metrics/models"],
  ["/company/details"],
  ["/company/details/access"],
  ["/company/attention"],
  ["/company/products"],
  ["/company/projects"],
  ["/company/tasks"],
  ["/company/routines"],
  ["/company/sources"],
  ["/company/decisions"],
  ["/company/wiki"],
];

describe("responses match the OpenAPI schemas", () => {
  for (const [path, template] of READS) {
    test(`GET ${path}`, async () => {
      const result = await call("GET", path);
      expect(result.status).toBe(200);
      const validate = ajv.getSchema(pointer(template ?? path, "get", "200"));
      expect(validate).toBeDefined();
      const valid = validate!(result.body);
      expect(valid ? [] : validate!.errors).toEqual([]);
    });
  }
});
