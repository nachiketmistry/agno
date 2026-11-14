import type { MiddlewareHandler } from "hono";

/** Origins every AgentOS allows so the Agno control plane can call it from the browser. */
export const DEFAULT_CORS_ORIGINS: readonly string[] = [
  "http://localhost:3000",
  "https://agno.com",
  "https://www.agno.com",
  "https://app.agno.com",
  "https://os-stg.agno.com",
  "https://os.agno.com",
];

const ALLOW_METHODS = "DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT, QUERY";

/**
 * CORS with the same observable headers as the Python AgentOS: credentials allowed,
 * every response header exposed, requested headers echoed on preflight, and the
 * origin echoed only when it is on the allow-list.
 */
export function cors(extraOrigins: readonly string[] = []): MiddlewareHandler {
  const allowed = new Set([...extraOrigins, ...DEFAULT_CORS_ORIGINS]);
  return async (c, next) => {
    const origin = c.req.header("Origin");
    const isPreflight = c.req.method === "OPTIONS" && origin && c.req.header("Access-Control-Request-Method");
    if (isPreflight) {
      const headers = new Headers({
        "Access-Control-Allow-Methods": ALLOW_METHODS,
        "Access-Control-Max-Age": "600",
        "Access-Control-Allow-Credentials": "true",
        "Content-Type": "text/plain; charset=utf-8",
        Vary: "Origin, Access-Control-Request-Method, Access-Control-Request-Headers",
      });
      const requested = c.req.header("Access-Control-Request-Headers");
      if (requested) headers.set("Access-Control-Allow-Headers", requested);
      if (!allowed.has(origin)) return new Response("Disallowed CORS origin", { status: 400, headers });
      headers.set("Access-Control-Allow-Origin", origin);
      return new Response("OK", { status: 200, headers });
    }
    await next();
    c.res.headers.append("Vary", "Origin");
    if (!origin) return;
    c.res.headers.set("Access-Control-Allow-Credentials", "true");
    c.res.headers.set("Access-Control-Expose-Headers", "*");
    if (allowed.has(origin)) c.res.headers.set("Access-Control-Allow-Origin", origin);
  };
}
