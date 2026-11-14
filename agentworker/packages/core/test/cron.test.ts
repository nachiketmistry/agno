import { describe, expect, test } from "bun:test";
import { computeNextRun, validateCronExpr, validateTimezone } from "../src";

describe("cron", () => {
  test("accepts five-field expressions", () => {
    for (const expr of ["0 * * * *", "0 9 * * 1", "*/15 * * * *", "0 0 1 1 *"])
      expect(validateCronExpr(expr)).toBe(true);
  });
  test("rejects anything else", () => {
    for (const expr of ["nope", "* * * *", "61 * * * *", "0 25 * * *"])
      expect(validateCronExpr(expr)).toBe(false);
  });
  test("validates IANA time zones", () => {
    expect(validateTimezone("UTC")).toBe(true);
    expect(validateTimezone("America/Los_Angeles")).toBe(true);
    expect(validateTimezone("Mars/Olympus")).toBe(false);
  });
  // Both expectations are values the Python AgentOS returned as next_run_at.
  test("weekly Monday 09:00 UTC from a Saturday", () => {
    expect(computeNextRun("0 9 * * 1", "UTC", 1794616550)).toBe(1794819600);
  });
  test("hourly from mid-hour", () => {
    expect(computeNextRun("0 * * * *", "UTC", 1794616657)).toBe(1794618000);
  });
  test("the next run is strictly after the given time", () => {
    expect(computeNextRun("0 * * * *", "UTC", 1794618000)).toBe(1794621600);
  });
  test("the time zone shifts the fire time", () => {
    // 09:00 in Los Angeles on Monday 2026-11-16 is 17:00 UTC (PST, UTC-8).
    expect(computeNextRun("0 9 * * 1", "America/Los_Angeles", 1794616550)).toBe(1794848400);
  });
});
