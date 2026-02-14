/**
 * Detects retry loops and stops expensive cycles.
 * Prevents runaway token costs from stuck tasks.
 */
export class LoopDetector {
  private attempts: Map<string, number> = new Map();

  checkLoop(taskId: string, maxAttempts: number = 3): void {
    const count = (this.attempts.get(taskId) || 0) + 1;
    this.attempts.set(taskId, count);

    if (count > maxAttempts) {
      throw new Error(
        `Loop detected: "${taskId}" attempted ${count} times (max: ${maxAttempts}). ` +
        `Manual intervention required to save tokens. ` +
        `Review the error, update the prompt, or check lessons.`
      );
    }
  }

  reset(taskId: string): void {
    this.attempts.delete(taskId);
  }

  getAttempts(taskId: string): number {
    return this.attempts.get(taskId) || 0;
  }

  resetAll(): void {
    this.attempts.clear();
  }
}
