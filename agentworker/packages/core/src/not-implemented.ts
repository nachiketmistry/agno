/** Thrown by every part of the core that is specified by tests but not built yet. */
export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`${what} is not implemented yet`);
    this.name = "NotImplementedError";
  }
}

export function notImplemented(what: string): never {
  throw new NotImplementedError(what);
}
