import { notImplemented } from "./not-implemented";

/**
 * AgentOS RBAC scopes.
 *
 * Formats: `resource:action` (global), `resource:<id>:action` (per resource),
 * `resource:*:action` (wildcard). `agent_os:admin` grants everything. The legacy
 * `system` resource is an alias for `config`.
 */
export const ADMIN_SCOPE = "agent_os:admin";
export const LEGACY_RESOURCE_ALIASES: Readonly<Record<string, string>> = { system: "config" };

export type ScopeType = "admin" | "global" | "per_resource" | "unknown";

export interface ParsedScope {
  raw: string;
  scopeType: ScopeType;
  resource?: string;
  resourceId?: string;
  action?: string;
  isWildcardResource: boolean;
}

export type ScopeMappings = Record<string, string[]>;

export interface RouteScopeCheck {
  allowed: boolean;
  requiredScopes: string[];
  /** Set only for GET listings where the caller holds per-resource scopes: filter to these ids. */
  accessibleResourceIds?: Set<string>;
}

export function parseScope(_scope: string, _adminScope?: string): ParsedScope {
  return notImplemented("parseScope");
}

/** Wire-format parts of a scope: [namespace, subNamespace, permission]. */
export function splitScope(_raw: string): [string, string | null, string] {
  return notImplemented("splitScope");
}

export function hasRequiredScopes(
  _userScopes: string[],
  _requiredScopes: string[],
  _options?: { resourceType?: string; resourceId?: string; adminScope?: string },
): boolean {
  return notImplemented("hasRequiredScopes");
}

export function getAccessibleResourceIds(
  _userScopes: string[],
  _resourceType: string,
  _options?: { adminScope?: string; action?: string },
): Set<string> {
  return notImplemented("getAccessibleResourceIds");
}

export function getRequiredScopesForRoute(
  _mappings: ScopeMappings,
  _method: string,
  _path: string,
): string[] {
  return notImplemented("getRequiredScopesForRoute");
}

/** [resourceType, resourceId] for /agents, /teams, /workflows paths; [null, null] otherwise. */
export function getResourceContextFromPath(_path: string): [string | null, string | null] {
  return notImplemented("getResourceContextFromPath");
}

export function checkRouteScopes(
  _userScopes: string[],
  _mappings: ScopeMappings,
  _method: string,
  _path: string,
  _adminScope?: string,
): RouteScopeCheck {
  return notImplemented("checkRouteScopes");
}
