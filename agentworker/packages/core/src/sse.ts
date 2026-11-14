import { notImplemented } from "./not-implemented";

export interface RunEvent {
  event: string;
  [field: string]: unknown;
}

/**
 * One SSE frame: `event: <name>\ndata: <compact json>\n\n`. JSON has no spaces
 * after separators and no newlines.
 */
export function formatSseEvent(_event: RunEvent): string {
  return notImplemented("formatSseEvent");
}

/**
 * Same frame with reconnection metadata: `event_index` is added to the data, and
 * `run_id` is added only when the event does not already carry one.
 */
export function formatSseEventWithIndex(_event: RunEvent, _eventIndex?: number, _runId?: string): string {
  return notImplemented("formatSseEventWithIndex");
}

/** Parse a stream body back into events. Comment lines such as `: heartbeat` are skipped. */
export function parseSseStream(_body: string): RunEvent[] {
  return notImplemented("parseSseStream");
}
