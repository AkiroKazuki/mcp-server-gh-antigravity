import fs from "node:fs/promises";
import path from "node:path";
import Database from 'better-sqlite3';
import { parseJsonl } from '@antigravity-os/shared';
import type { RateLimitStatus } from './types.js';

interface BudgetConfig {
  daily_limit_usd: number;
  weekly_limit_usd: number;
  monthly_limit_usd: number;
  alert_threshold: number;
  costs: {
    antigravity_input: number;
    antigravity_output: number;
    copilot: number;
  };
  emergency_override: boolean;
  override_expires_at?: string;
}

interface CostEntry {
  date: string;
  agent: string;
  tokens: number;
  cost_usd: number;
  task_description: string;
  timestamp: string;
}

const DEFAULT_CONFIG: BudgetConfig = {
  daily_limit_usd: 2.0,
  weekly_limit_usd: 10.0,
  monthly_limit_usd: 30.0,
  alert_threshold: 0.8,
  costs: {
    antigravity_input: 0.015,
    antigravity_output: 0.075,
    copilot: 0.0,
  },
  emergency_override: false,
};

/**
 * Budget enforcement + rate limiting.
 * Configurable via .memory/config/budget.json.
 * Rate limits stored in SQLite for sliding window enforcement.
 */
export class BudgetEnforcer {
  private projectRoot: string;
  private config: BudgetConfig = DEFAULT_CONFIG;
  private db: Database.Database | null = null;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  private getDb(): Database.Database {
    if (!this.db) {
      const dbPath = path.join(
        this.projectRoot,
        process.env.MEMORY_DIR || ".memory",
        "antigravity.db"
      );
      this.db = new Database(dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS rate_limits (
          operation TEXT PRIMARY KEY,
          per_minute INTEGER,
          per_hour INTEGER,
          per_day INTEGER
        );
        CREATE TABLE IF NOT EXISTS rate_limit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          operation TEXT NOT NULL,
          timestamp TEXT NOT NULL DEFAULT (datetime('now')),
          allowed INTEGER NOT NULL DEFAULT 1
        );
        CREATE INDEX IF NOT EXISTS idx_rll_op ON rate_limit_log(operation);
        CREATE INDEX IF NOT EXISTS idx_rll_ts ON rate_limit_log(timestamp);
      `);
    }
    return this.db;
  }

  async loadConfig(): Promise<void> {
    const configPath = path.join(
      this.projectRoot,
      ".memory",
      "config",
      "budget.json"
    );

    try {
      const data = await fs.readFile(configPath, "utf-8");
      this.config = { ...DEFAULT_CONFIG, ...JSON.parse(data) };
    } catch {
      try {
        await fs.mkdir(path.dirname(configPath), { recursive: true });
        await fs.writeFile(
          configPath,
          JSON.stringify(DEFAULT_CONFIG, null, 2),
          "utf-8"
        );
        console.error("[budget] Created default budget config");
      } catch {
        // Ignore
      }
    }
  }

  async checkBudget(
    estimatedTokens: number,
    agent: string
  ): Promise<{
    allowed: boolean;
    today_spend: number;
    operation_cost: number;
    projected_total: number;
    daily_limit: number;
    warning?: string;
  }> {
    await this.loadConfig();

    if (this.config.emergency_override) {
      // Check if override has expired
      if (this.config.override_expires_at) {
        const expiresAt = new Date(this.config.override_expires_at);
        if (expiresAt <= new Date()) {
          // Override expired — disable it and persist the change
          this.config.emergency_override = false;
          this.config.override_expires_at = undefined;
          await this.persistConfig();
          // Fall through to normal budget check
        } else {
          return {
            allowed: true,
            today_spend: 0,
            operation_cost: 0,
            projected_total: 0,
            daily_limit: this.config.daily_limit_usd,
            warning: `Emergency override active (expires: ${this.config.override_expires_at}). Budget limits are disabled.`,
          };
        }
      } else {
        return {
          allowed: true,
          today_spend: 0,
          operation_cost: 0,
          projected_total: 0,
          daily_limit: this.config.daily_limit_usd,
          warning: "Emergency override active with NO expiry. Set override_expires_at to auto-disable.",
        };
      }
    }

    const today = new Date().toISOString().split("T")[0];
    const todaySpend = await this.getSpendForDate(today);

    const operationCost =
      agent === "antigravity"
        ? (estimatedTokens / 1000) * this.config.costs.antigravity_input
        : 0;

    const projectedTotal = todaySpend + operationCost;

    if (projectedTotal > this.config.daily_limit_usd) {
      return {
        allowed: false,
        today_spend: todaySpend,
        operation_cost: operationCost,
        projected_total: projectedTotal,
        daily_limit: this.config.daily_limit_usd,
        warning:
          `BUDGET EXCEEDED: Today's spend $${todaySpend.toFixed(2)} + ` +
          `operation $${operationCost.toFixed(2)} = $${projectedTotal.toFixed(2)} ` +
          `exceeds daily limit of $${this.config.daily_limit_usd}. ` +
          `Edit budget in .memory/config/budget.json or set emergency_override: true.`,
      };
    }

    const result: {
      allowed: boolean;
      today_spend: number;
      operation_cost: number;
      projected_total: number;
      daily_limit: number;
      warning?: string;
    } = {
      allowed: true,
      today_spend: todaySpend,
      operation_cost: operationCost,
      projected_total: projectedTotal,
      daily_limit: this.config.daily_limit_usd,
    };

    const threshold = this.config.daily_limit_usd * this.config.alert_threshold;
    if (projectedTotal > threshold) {
      result.warning =
        `Approaching daily limit: $${projectedTotal.toFixed(2)}/$${this.config.daily_limit_usd} ` +
        `(${((projectedTotal / this.config.daily_limit_usd) * 100).toFixed(0)}%)`;
    }

    return result;
  }

  async getSpendForDate(date: string): Promise<number> {
    const entries = await this.readCostLog();
    return entries
      .filter((e) => e.date === date)
      .reduce((sum, e) => sum + e.cost_usd, 0);
  }

  async getSpendForPeriod(
    period: "today" | "week" | "month" | "all"
  ): Promise<{ total_cost: number; total_tokens: number; entries: CostEntry[] }> {
    const entries = await this.readCostLog();
    const now = new Date();
    const today = now.toISOString().split("T")[0];

    let filtered: CostEntry[];

    switch (period) {
      case "today":
        filtered = entries.filter((e) => e.date === today);
        break;
      case "week": {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const weekStr = weekAgo.toISOString().split("T")[0];
        filtered = entries.filter((e) => e.date >= weekStr);
        break;
      }
      case "month": {
        const monthStr = today.slice(0, 7);
        filtered = entries.filter((e) => e.date.startsWith(monthStr));
        break;
      }
      case "all":
      default:
        filtered = entries;
        break;
    }

    return {
      total_cost: filtered.reduce((sum, e) => sum + e.cost_usd, 0),
      total_tokens: filtered.reduce((sum, e) => sum + e.tokens, 0),
      entries: filtered,
    };
  }

  async readCostLog(): Promise<CostEntry[]> {
    const logFile = path.join(
      this.projectRoot,
      ".memory",
      "snapshots",
      "costs.jsonl"
    );

    try {
      const content = await fs.readFile(logFile, "utf-8");
      return parseJsonl<CostEntry>(content).entries;
    } catch {
      return [];
    }
  }

  getConfig(): BudgetConfig {
    return { ...this.config };
  }

  private async persistConfig(): Promise<void> {
    const configPath = path.join(
      this.projectRoot,
      ".memory",
      "config",
      "budget.json"
    );
    try {
      await fs.writeFile(configPath, JSON.stringify(this.config, null, 2), "utf-8");
    } catch { /* ignore write failures */ }
  }

  // --- Rate Limiting ---

  checkRateLimit(operation: string): {
    allowed: boolean;
    current: number;
    limit: number;
    reset_at: string;
    window: string;
  } {
    const db = this.getDb();

    const config = db.prepare(
      `SELECT per_minute, per_hour, per_day FROM rate_limits WHERE operation = ?`
    ).get(operation) as { per_minute: number | null; per_hour: number | null; per_day: number | null } | undefined;

    if (!config) {
      // Log the call but no limit configured
      db.prepare(
        `INSERT INTO rate_limit_log (operation, allowed) VALUES (?, 1)`
      ).run(operation);
      return { allowed: true, current: 0, limit: 0, reset_at: '', window: 'none' };
    }

    // Check per-minute limit
    if (config.per_minute) {
      const count = (db.prepare(
        `SELECT COUNT(*) as cnt FROM rate_limit_log
         WHERE operation = ? AND timestamp >= datetime('now', '-1 minute') AND allowed = 1`
      ).get(operation) as { cnt: number }).cnt;

      if (count >= config.per_minute) {
        db.prepare(
          `INSERT INTO rate_limit_log (operation, allowed) VALUES (?, 0)`
        ).run(operation);
        const resetAt = new Date(Date.now() + 60000).toISOString();
        return { allowed: false, current: count, limit: config.per_minute, reset_at: resetAt, window: 'per_minute' };
      }
    }

    // Check per-hour limit
    if (config.per_hour) {
      const count = (db.prepare(
        `SELECT COUNT(*) as cnt FROM rate_limit_log
         WHERE operation = ? AND timestamp >= datetime('now', '-1 hour') AND allowed = 1`
      ).get(operation) as { cnt: number }).cnt;

      if (count >= config.per_hour) {
        db.prepare(
          `INSERT INTO rate_limit_log (operation, allowed) VALUES (?, 0)`
        ).run(operation);
        const resetAt = new Date(Date.now() + 3600000).toISOString();
        return { allowed: false, current: count, limit: config.per_hour, reset_at: resetAt, window: 'per_hour' };
      }
    }

    // Check per-day limit
    if (config.per_day) {
      const count = (db.prepare(
        `SELECT COUNT(*) as cnt FROM rate_limit_log
         WHERE operation = ? AND timestamp >= datetime('now', '-1 day') AND allowed = 1`
      ).get(operation) as { cnt: number }).cnt;

      if (count >= config.per_day) {
        db.prepare(
          `INSERT INTO rate_limit_log (operation, allowed) VALUES (?, 0)`
        ).run(operation);
        const resetAt = new Date(Date.now() + 86400000).toISOString();
        return { allowed: false, current: count, limit: config.per_day, reset_at: resetAt, window: 'per_day' };
      }
    }

    // Allowed — log successful call
    db.prepare(
      `INSERT INTO rate_limit_log (operation, allowed) VALUES (?, 1)`
    ).run(operation);

    return { allowed: true, current: 0, limit: 0, reset_at: '', window: 'none' };
  }

  setRateLimit(operation: string, perMinute?: number, perHour?: number, perDay?: number): void {
    const db = this.getDb();
    db.prepare(
      `INSERT OR REPLACE INTO rate_limits (operation, per_minute, per_hour, per_day) VALUES (?, ?, ?, ?)`
    ).run(operation, perMinute ?? null, perHour ?? null, perDay ?? null);
  }

  getRateLimitStatus(): RateLimitStatus[] {
    const db = this.getDb();

    const configs = db.prepare(`SELECT * FROM rate_limits`).all() as Array<{
      operation: string; per_minute: number | null; per_hour: number | null; per_day: number | null;
    }>;

    return configs.map((config) => {
      const status: RateLimitStatus = { operation: config.operation };

      if (config.per_minute) {
        const count = (db.prepare(
          `SELECT COUNT(*) as cnt FROM rate_limit_log
           WHERE operation = ? AND timestamp >= datetime('now', '-1 minute') AND allowed = 1`
        ).get(config.operation) as { cnt: number }).cnt;

        status.per_minute = {
          current: count,
          limit: config.per_minute,
          reset_at: new Date(Date.now() + 60000).toISOString(),
        };
      }

      if (config.per_hour) {
        const count = (db.prepare(
          `SELECT COUNT(*) as cnt FROM rate_limit_log
           WHERE operation = ? AND timestamp >= datetime('now', '-1 hour') AND allowed = 1`
        ).get(config.operation) as { cnt: number }).cnt;

        status.per_hour = {
          current: count,
          limit: config.per_hour,
          reset_at: new Date(Date.now() + 3600000).toISOString(),
        };
      }

      if (config.per_day) {
        const count = (db.prepare(
          `SELECT COUNT(*) as cnt FROM rate_limit_log
           WHERE operation = ? AND timestamp >= datetime('now', '-1 day') AND allowed = 1`
        ).get(config.operation) as { cnt: number }).cnt;

        status.per_day = {
          current: count,
          limit: config.per_day,
          reset_at: new Date(Date.now() + 86400000).toISOString(),
        };
      }

      return status;
    });
  }

  closeDb(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
