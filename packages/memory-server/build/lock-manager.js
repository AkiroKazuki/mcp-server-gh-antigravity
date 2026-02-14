import path from "node:path";
/**
 * File-level locking with FIFO queue for concurrent write safety.
 * Prevents corruption when multiple tasks try to write to the same file.
 */
export class FileLockManager {
    locks = new Map();
    queues = new Map();
    async acquireLock(filepath) {
        const normalized = path.resolve(filepath);
        while (this.locks.has(normalized)) {
            await new Promise((resolve) => {
                const queue = this.queues.get(normalized) || [];
                queue.push(resolve);
                this.queues.set(normalized, queue);
            });
        }
        let releaseLock;
        const lockPromise = new Promise((resolve) => {
            releaseLock = resolve;
        });
        this.locks.set(normalized, lockPromise);
        console.error(`[lock] acquired: ${path.basename(normalized)}`);
        return () => {
            this.locks.delete(normalized);
            console.error(`[lock] released: ${path.basename(normalized)}`);
            const queue = this.queues.get(normalized) || [];
            const next = queue.shift();
            if (next) {
                next();
            }
            else {
                this.queues.delete(normalized);
            }
        };
    }
    async withLock(filepath, operation) {
        const release = await this.acquireLock(filepath);
        try {
            return await operation();
        }
        finally {
            release();
        }
    }
    isLocked(filepath) {
        return this.locks.has(path.resolve(filepath));
    }
    getQueueLength(filepath) {
        const normalized = path.resolve(filepath);
        return (this.queues.get(normalized) || []).length;
    }
    getActiveLocks() {
        return Array.from(this.locks.keys()).map((filepath) => ({
            file: filepath,
            queueLength: this.getQueueLength(filepath),
        }));
    }
}
