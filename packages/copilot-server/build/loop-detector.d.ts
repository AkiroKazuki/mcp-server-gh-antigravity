/**
 * Detects retry loops and stops expensive cycles.
 * Prevents runaway token costs from stuck tasks.
 */
export declare class LoopDetector {
    private attempts;
    checkLoop(taskId: string, maxAttempts?: number): void;
    reset(taskId: string): void;
    getAttempts(taskId: string): number;
    resetAll(): void;
}
