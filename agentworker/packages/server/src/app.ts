import { GREEDY_PATH_PARAMS, operations, pathPattern } from "@agentworker/contract";
import { type Handler, Hono } from "hono";
import { cors } from "./cors";

export interface AppOptions {
  /** The OS id. JWTs must carry it as their `aud` claim once authorization is on. */
  osId: string;
  name?: string;
  description?: string;
  /** Origins allowed in addition to the Agno control plane defaults. */
  corsAllowedOrigins?: string[];
  /** PEM public keys that verify control-plane JWTs. Authorization is on when this is set. */
  jwtVerificationKeys?: string[];
}

/** OpenAPI `/agents/{agent_id}` to the router's `/agents/:agent_id`; greedy parameters match the rest. */
function toRoutePattern(path: string): string {
  return path.replace(/\{([^}]+)\}/g, (_, name: string) =>
    GREEDY_PATH_PARAMS.includes(name) ? `:${name}{.+}` : `:${name}`,
  );
}

/**
 * The AgentOS HTTP surface. Every operation in the exported contract is routed.
 * Operations that are not built yet answer 501 with the operation id, so the
 * conformance suite shows exactly what is left.
 */
export function createApp(options: AppOptions): Hono {
  const instantiatedAt = new Date().toISOString().replace("Z", "000Z");
  const app = new Hono({ strict: false });

  app.use("*", cors(options.corsAllowedOrigins));

  const implemented = new Set<string>();
  const implement = (method: "GET" | "POST", path: string, handler: Handler) => {
    implemented.add(`${method} ${path}`);
    app.on(method, toRoutePattern(path), handler);
  };

  implement("GET", "/health", (c) => c.json({ status: "ok", instantiated_at: instantiatedAt }));

  for (const operation of operations) {
    if (implemented.has(`${operation.method} ${operation.path}`)) continue;
    app.on(operation.method, toRoutePattern(operation.path), (c) =>
      c.json({ detail: `Not implemented: ${operation.operationId}`, error_type: "NotImplemented" }, 501),
    );
  }

  app.notFound((c) => {
    const path = new URL(c.req.url).pathname.replace(/(.)\/$/, "$1");
    const known = operations.some((operation) => pathPattern(operation.path).test(path));
    return known ? c.json({ detail: "Method Not Allowed" }, 405) : c.json({ detail: "Not Found" }, 404);
  });

  app.onError((error, c) => {
    console.error(error);
    return c.json({ detail: "Internal Server Error" }, 500);
  });

  return app;
}
