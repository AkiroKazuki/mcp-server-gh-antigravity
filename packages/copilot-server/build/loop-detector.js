/**
 * Detects retry loops and stops expensive cycles.
 * Prevents runaway token costs from stuck tasks.
 */
export class LoopDetector {
    attempts = new Map();
    checkLoop(taskId, maxAttempts = 3) {
        const count = (this.attempts.get(taskId) || 0) + 1;
        this.attempts.set(taskId, count);
        if (count > maxAttempts) {
            throw new Error(`Loop detected: "${taskId}" attempted ${count} times (max: ${maxAttempts}). ` +
                `Manual intervention required to save tokens. ` +
                `Review the error, update the prompt, or check lessons.`);
        }
    }
    reset(taskId) {
        this.attempts.delete(taskId);
    }
    getAttempts(taskId) {
        return this.attempts.get(taskId) || 0;
    }
    resetAll() {
        this.attempts.clear();
    }
}
