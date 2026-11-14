const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;
const EPOCH_KEYS = /(_at|^last_run|^target_date)$/;
const VOLATILE_KEYS = new Set(["search_time_ms"]);

/**
 * Replaces values that differ between two correct servers (generated ids, clocks,
 * timings) with placeholders, so a recorded Python response can be compared to a
 * live one field by field.
 */
export function normalize(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) return value.map((item) => normalize(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k.replace(UUID, "<uuid>"), normalize(v, k)]),
    );
  }
  if (VOLATILE_KEYS.has(key) && typeof value === "number") return "<ms>";
  if (typeof value === "number" && EPOCH_KEYS.test(key)) return "<epoch>";
  if (typeof value === "string") {
    if (ISO_TIME.test(value)) return "<timestamp>";
    return value.replace(UUID, "<uuid>");
  }
  return value;
}

/** A short random suffix so tests can share one long-lived server without colliding. */
export function unique(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}
