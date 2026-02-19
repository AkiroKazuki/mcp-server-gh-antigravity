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
}
interface CostEntry {
    date: string;
    agent: string;
    tokens: number;
    cost_usd: number;
    task_description: string;
    timestamp: string;
}
/**
 * Budget enforcement + rate limiting.
 * Configurable via .memory/config/budget.json.
 * Rate limits stored in SQLite for sliding window enforcement.
 */
export declare class BudgetEnforcer {
    private projectRoot;
    private config;
    private db;
    constructor(projectRoot: string);
    private getDb;
    loadConfig(): Promise<void>;
    checkBudget(estimatedTokens: number, agent: string): Promise<{
        allowed: boolean;
        today_spend: number;
        operation_cost: number;
        projected_total: number;
        daily_limit: number;
        warning?: string;
    }>;
    getSpendForDate(date: string): Promise<number>;
    getSpendForPeriod(period: "today" | "week" | "month" | "all"): Promise<{
        total_cost: number;
        total_tokens: number;
        entries: CostEntry[];
    }>;
    readCostLog(): Promise<CostEntry[]>;
    getConfig(): BudgetConfig;
    checkRateLimit(operation: string): {
        allowed: boolean;
        current: number;
        limit: number;
        reset_at: string;
        window: string;
    };
    setRateLimit(operation: string, perMinute?: number, perHour?: number, perDay?: number): void;
    getRateLimitStatus(): RateLimitStatus[];
    closeDb(): void;
}
export {};
