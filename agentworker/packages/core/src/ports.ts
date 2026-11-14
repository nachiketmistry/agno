/**
 * The interfaces the portable core calls. Each host (Cloudflare, Node on Railway or
 * Kubernetes) supplies one adapter per interface. User-defined agents, teams,
 * workflows and CompanyOS records depend only on the core, never on an adapter.
 *
 * Every call carries the tenant, so a host can map it to its own isolation
 * boundary: a Durable Object or Worker on Cloudflare, a schema or row filter on Postgres.
 */
export interface Tenant {
  organizationId: string;
  osId: string;
}

export interface StateStore {
  get<T>(tenant: Tenant, collection: string, id: string): Promise<T | null>;
  put<T>(
    tenant: Tenant,
    collection: string,
    id: string,
    value: T,
    options?: { expectedVersion?: number },
  ): Promise<void>;
  delete(tenant: Tenant, collection: string, id: string): Promise<boolean>;
  list<T>(
    tenant: Tenant,
    collection: string,
    query?: { where?: Record<string, unknown>; limit?: number; page?: number; orderBy?: string },
  ): Promise<{ rows: T[]; total: number }>;
  /** Run several writes atomically. */
  transaction<T>(tenant: Tenant, work: (store: StateStore) => Promise<T>): Promise<T>;
}

export interface Scheduler {
  /** Arrange for `onDue` to be called for the schedule at `atEpochSeconds`. */
  setNext(tenant: Tenant, scheduleId: string, atEpochSeconds: number): Promise<void>;
  cancel(tenant: Tenant, scheduleId: string): Promise<void>;
}

export interface DurableStep {
  do<T>(
    name: string,
    work: () => Promise<T>,
    options?: { retries?: number; timeoutSeconds?: number },
  ): Promise<T>;
  sleep(name: string, seconds: number): Promise<void>;
  waitForEvent<T>(name: string, options: { type: string; timeoutSeconds?: number }): Promise<T>;
}

export interface DurableExecutor {
  start(tenant: Tenant, workflow: string, instanceId: string, input: unknown): Promise<void>;
  sendEvent(tenant: Tenant, instanceId: string, event: { type: string; payload: unknown }): Promise<void>;
  cancel(tenant: Tenant, instanceId: string): Promise<void>;
  status(
    tenant: Tenant,
    instanceId: string,
  ): Promise<"queued" | "running" | "paused" | "completed" | "failed" | "cancelled">;
}

export interface EventStream {
  append(tenant: Tenant, runId: string, event: { event: string; [field: string]: unknown }): Promise<number>;
  replay(
    tenant: Tenant,
    runId: string,
    afterEventIndex?: number,
  ): Promise<{ eventIndex: number; event: unknown }[]>;
  /** Live events after `afterEventIndex`; ends when the run reaches a terminal status. */
  tail(
    tenant: Tenant,
    runId: string,
    afterEventIndex?: number,
  ): AsyncIterable<{ eventIndex: number; event: unknown }>;
  requestCancel(tenant: Tenant, runId: string): Promise<void>;
  isCancelRequested(tenant: Tenant, runId: string): Promise<boolean>;
}

export interface Queue {
  send(tenant: Tenant, topic: string, message: unknown, options?: { delaySeconds?: number }): Promise<void>;
}

export interface BlobStore {
  put(
    tenant: Tenant,
    key: string,
    body: ReadableStream | ArrayBuffer | string,
    options?: { contentType?: string },
  ): Promise<{ sha256: string; size: number }>;
  get(
    tenant: Tenant,
    key: string,
  ): Promise<{ body: ReadableStream; contentType?: string; size: number } | null>;
  delete(tenant: Tenant, key: string): Promise<void>;
  list(tenant: Tenant, prefix: string): Promise<{ key: string; size: number; sha256?: string }[]>;
}

export interface VectorStore {
  upsert(
    tenant: Tenant,
    namespace: string,
    items: { id: string; vector: number[]; metadata?: Record<string, unknown> }[],
  ): Promise<void>;
  query(
    tenant: Tenant,
    namespace: string,
    vector: number[],
    options?: { topK?: number; filter?: Record<string, unknown> },
  ): Promise<{ id: string; score: number; metadata?: Record<string, unknown> }[]>;
  delete(tenant: Tenant, namespace: string, ids: string[]): Promise<void>;
}

export interface Sandbox {
  exec(
    command: string[],
    options?: { cwd?: string; env?: Record<string, string>; timeoutSeconds?: number },
  ): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  checkout(repository: { url: string; branch: string; commit?: string }): Promise<{
    url: string;
    branch: string;
    commit: string;
  }>;
  checkpoint(): Promise<string>;
  restore(checkpointId: string): Promise<void>;
  destroy(): Promise<void>;
}

export interface SandboxProvider {
  create(
    tenant: Tenant,
    sessionId: string,
    generation: number,
    options?: { env?: Record<string, string> },
  ): Promise<Sandbox>;
}

export interface Adapters {
  state: StateStore;
  scheduler: Scheduler;
  executor: DurableExecutor;
  events: EventStream;
  queue: Queue;
  blobs: BlobStore;
  vectors: VectorStore;
  sandboxes: SandboxProvider;
}
