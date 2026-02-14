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
 * Budget enforcement that prevents runaway spending.
 * Configurable via .memory/config/budget.json.
 */
export declare class BudgetEnforcer {
    private projectRoot;
    private config;
    constructor(projectRoot: string);
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
}
export {};
