/**
 * Antigravity OS v2.0 - Shared Utilities
 * Structured logger, JSONL parser, and common helpers.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  server: string;
  message: string;
  data?: Record<string, unknown>;
}

/**
 * Minimal structured logger that outputs JSON to stderr.
 * AI agents and observability tools can parse these for debugging.
 */
export class Logger {
  constructor(private server: string) { }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      server: this.server,
      message,
      ...(data ? { data } : {}),
    };
    console.error(JSON.stringify(entry));
  }

  debug(message: string, data?: Record<string, unknown>) { this.log("debug", message, data); }
  info(message: string, data?: Record<string, unknown>) { this.log("info", message, data); }
  warn(message: string, data?: Record<string, unknown>) { this.log("warn", message, data); }
  error(message: string, data?: Record<string, unknown>) { this.log("error", message, data); }
}

/**
 * Parse JSONL content line-by-line, skipping corrupted lines instead of throwing.
 * Returns both parsed entries and count of skipped lines for observability.
 */
export function parseJsonl<T>(content: string): { entries: T[]; skipped: number } {
  const lines = content.trim().split("\n").filter(Boolean);
  const entries: T[] = [];
  let skipped = 0;

  for (const line of lines) {
    try {
      entries.push(JSON.parse(line) as T);
    } catch {
      skipped++;
    }
  }

  return { entries, skipped };
}

/**
 * Lightweight runtime input validator for MCP tool arguments.
 * Validates required fields and types without external dependencies.
 * Throws descriptive errors for AI agents to understand what went wrong.
 */
export class InputValidator {
  private errors: string[] = [];

  constructor(private toolName: string, private args: Record<string, unknown>) {}

  requireString(field: string): this {
    const val = this.args[field];
    if (val === undefined || val === null) {
      this.errors.push(`Missing required field: ${field}`);
    } else if (typeof val !== "string") {
      this.errors.push(`${field} must be a string, got ${typeof val}`);
    }
    return this;
  }

  requireNumber(field: string): this {
    const val = this.args[field];
    if (val === undefined || val === null) {
      this.errors.push(`Missing required field: ${field}`);
    } else if (typeof val !== "number" || isNaN(val as number)) {
      this.errors.push(`${field} must be a number, got ${typeof val}`);
    }
    return this;
  }

  optionalString(field: string): this {
    const val = this.args[field];
    if (val !== undefined && val !== null && typeof val !== "string") {
      this.errors.push(`${field} must be a string if provided, got ${typeof val}`);
    }
    return this;
  }

  optionalNumber(field: string): this {
    const val = this.args[field];
    if (val !== undefined && val !== null && (typeof val !== "number" || isNaN(val as number))) {
      this.errors.push(`${field} must be a number if provided, got ${typeof val}`);
    }
    return this;
  }

  optionalArray(field: string): this {
    const val = this.args[field];
    if (val !== undefined && val !== null && !Array.isArray(val)) {
      this.errors.push(`${field} must be an array if provided, got ${typeof val}`);
    }
    return this;
  }

  requireEnum(field: string, allowed: string[]): this {
    const val = this.args[field];
    if (val === undefined || val === null) {
      this.errors.push(`Missing required field: ${field}`);
    } else if (!allowed.includes(val as string)) {
      this.errors.push(`${field} must be one of [${allowed.join(", ")}], got "${val}"`);
    }
    return this;
  }

  optionalEnum(field: string, allowed: string[]): this {
    const val = this.args[field];
    if (val !== undefined && val !== null && !allowed.includes(val as string)) {
      this.errors.push(`${field} must be one of [${allowed.join(", ")}], got "${val}"`);
    }
    return this;
  }

  validate(): void {
    if (this.errors.length > 0) {
      throw new Error(
        `[${this.toolName}] Invalid input: ${this.errors.join("; ")}`
      );
    }
  }
}
