/**
 * Antigravity OS v2.1 - Shared Tool Handler Utilities
 * Centralized error handling wrapper and response helpers.
 */

import { Logger } from "./utils.js";

export function respond(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function respondError(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
  };
}

/**
 * Wraps a tool handler with standardized error handling, logging, and timing.
 * Eliminates repetitive try/catch in each handler.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function withToolHandler(
  log: Logger,
  toolName: string,
  handler: () => Promise<any>,
  profiler?: { logOperation: (server: string, op: string, duration: number, success: boolean, meta?: Record<string, unknown>) => void },
  serverName?: string,
) {
  const start = performance.now();
  try {
    const result = await handler();
    if (profiler && serverName) {
      profiler.logOperation(serverName, toolName, performance.now() - start, true);
    }
    return result;
  } catch (error: unknown) {
    const duration = performance.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    log.error(`Tool ${toolName} failed`, { error: message, duration_ms: duration });
    if (profiler && serverName) {
      profiler.logOperation(serverName, toolName, duration, false, { error: message });
    }
    return respondError(`Error: ${message}`);
  }
}
