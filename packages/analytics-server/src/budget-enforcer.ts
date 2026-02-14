import fs from "node:fs/promises";
import path from "node:path";

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
 * Budget enforcement that prevents runaway spending.
 * Configurable via .memory/config/budget.json.
 */
export class BudgetEnforcer {
  private projectRoot: string;
  private config: BudgetConfig = DEFAULT_CONFIG;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
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
      // Use defaults, create config file for user reference
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
      return {
        allowed: true,
        today_spend: 0,
        operation_cost: 0,
        projected_total: 0,
        daily_limit: this.config.daily_limit_usd,
        warning: "Emergency override is active. Budget limits are disabled.",
      };
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

    // Check alert threshold
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
        const monthStr = today.slice(0, 7); // YYYY-MM
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
      const lines = content.trim().split("\n").filter(Boolean);
      return lines.map((line) => JSON.parse(line));
    } catch {
      return [];
    }
  }

  getConfig(): BudgetConfig {
    return { ...this.config };
  }
}
