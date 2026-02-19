/**
 * Antigravity OS v2.0 - Health Monitor
 * Checks system component health: disk, git, semantic index, budget, memory files.
 */
import type { HealthCheckResult } from './types.js';
export declare class HealthMonitor {
    private projectRoot;
    private memoryPath;
    constructor(projectRoot: string);
    check(): Promise<HealthCheckResult>;
    private checkMemoryFiles;
    private checkGitRepo;
    private checkSemanticIndex;
    private checkBudget;
    private checkDatabase;
    private checkDiskSpace;
}
