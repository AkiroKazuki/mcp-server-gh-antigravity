/**
 * Antigravity OS v2.1 - Shared Tool Handler Utilities
 * Centralized error handling wrapper and response helpers.
 */

import { Logger } from "./utils.js";

export interface ToolResponse {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export function respond(data: unknown): ToolResponse {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function respondError(message: string): ToolResponse {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

/**
 * Wraps a tool handler with standardized error handling, logging, and timing.
 * Eliminates repetitive try/catch in each handler.
 */
export function withToolHandler(
  log: Logger,
  toolName: string,
  handler: () => Promise<ToolResponse>,
  profiler?: { logOperation: (server: string, op: string, duration: number, success: boolean, meta?: Record<string, unknown>) => void },
  serverName?: string,
): Promise<ToolResponse> {
  const start = performance.now();
  return handler()
    .then((result) => {
      if (profiler && serverName) {
        profiler.logOperation(serverName, toolName, performance.now() - start, true);
      }
      return result;
    })
    .catch((error: Error) => {
      const duration = performance.now() - start;
      log.error(`Tool ${toolName} failed`, { error: error.message, duration_ms: duration });
      if (profiler && serverName) {
        profiler.logOperation(serverName, toolName, duration, false, { error: error.message });
      }
      return respondError(`Error: ${error.message}`);
    });
}
