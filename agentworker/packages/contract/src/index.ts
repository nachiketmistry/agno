import openapi from "../openapi.json";
import scopeMappings from "../scope-mappings.json";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface Operation {
  method: HttpMethod;
  /** OpenAPI path template, for example `/agents/{agent_id}/runs`. */
  path: string;
  operationId: string;
  tags: string[];
  /** Status codes the contract documents for this operation. */
  responses: string[];
}

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

type PathItem = Record<
  string,
  { operationId?: string; tags?: string[]; responses?: Record<string, unknown> }
>;

/** Every operation the Python AgentOS serves, read from its exported OpenAPI document. */
export const operations: Operation[] = Object.entries(openapi.paths as unknown as Record<string, PathItem>)
  .flatMap(([path, item]) =>
    METHODS.filter((method) => item[method.toLowerCase()]).map((method) => {
      const operation = item[method.toLowerCase()]!;
      return {
        method,
        path,
        operationId: operation.operationId ?? `${method} ${path}`,
        tags: operation.tags ?? [],
        responses: Object.keys(operation.responses ?? {}),
      };
    }),
  )
  .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

/**
 * Path parameters that match the rest of the path, slashes included. FastAPI declares
 * them as `{name:path}`, but the OpenAPI document shows a plain `{name}`.
 */
export const GREEDY_PATH_PARAMS = ["path", "storage_key"];

function isGreedy(segment: string): boolean {
  return GREEDY_PATH_PARAMS.includes(segment.slice(1, -1));
}

/** A regular expression that matches concrete paths for an OpenAPI path template. */
export function pathPattern(template: string): RegExp {
  const source = template
    .split("/")
    .map((segment) =>
      segment.startsWith("{")
        ? isGreedy(segment)
          ? ".+"
          : "[^/]+"
        : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    )
    .join("/");
  return new RegExp(`^${source}$`);
}

/** The contract operation a request belongs to. The most literal template wins. */
export function matchOperation(method: string, path: string): Operation | undefined {
  const clean = path.split("?")[0]!.replace(/(.)\/$/, "$1");
  const literals = (operation: Operation) =>
    operation.path.split("/").filter((segment) => !segment.startsWith("{")).length;
  return operations
    .filter((operation) => operation.method === method && pathPattern(operation.path).test(clean))
    .sort((a, b) => literals(b) - literals(a))[0];
}

/** `"METHOD /path/pattern"` to the scopes the route requires, exported from the Python AgentOS. */
export const defaultScopeMappings: Record<string, string[]> = scopeMappings;

export const agentOsVersion: string = (openapi.info as { version: string }).version;

export { openapi };
