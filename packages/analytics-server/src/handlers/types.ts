import type Database from "better-sqlite3";
import type { BudgetEnforcer } from "../budget-enforcer.js";
import type { PerformanceProfiler } from "../performance.js";
import type { HealthMonitor } from "../health-monitor.js";
import type { FileLockManager } from "@antigravity-os/shared";

export interface AnalyticsContext {
  db: Database.Database;
  budget: BudgetEnforcer;
  profiler: PerformanceProfiler;
  health: HealthMonitor;
  memoryPath: string;
  lockManager: FileLockManager;
}
