import path from "node:path";

/**
 * File-level locking with FIFO queue for concurrent write safety.
 * Prevents corruption when multiple tasks try to write to the same file.
 */
export class FileLockManager {
  private locks: Map<string, Promise<void>> = new Map();
  private queues: Map<string, Array<() => void>> = new Map();

  async acquireLock(filepath: string): Promise<() => void> {
    const normalized = path.resolve(filepath);

    while (this.locks.has(normalized)) {
      await new Promise<void>((resolve) => {
        const queue = this.queues.get(normalized) || [];
        queue.push(resolve);
        this.queues.set(normalized, queue);
      });
    }

    let releaseLock!: () => void;
    const lockPromise = new Promise<void>((resolve) => {
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
      } else {
        this.queues.delete(normalized);
      }
    };
  }

  async withLock<T>(filepath: string, operation: () => Promise<T>): Promise<T> {
    const release = await this.acquireLock(filepath);
    try {
      return await operation();
    } finally {
      release();
    }
  }

  isLocked(filepath: string): boolean {
    return this.locks.has(path.resolve(filepath));
  }

  getQueueLength(filepath: string): number {
    const normalized = path.resolve(filepath);
    return (this.queues.get(normalized) || []).length;
  }

  getActiveLocks(): Array<{ file: string; queueLength: number }> {
    return Array.from(this.locks.keys()).map((filepath) => ({
      file: filepath,
      queueLength: this.getQueueLength(filepath),
    }));
  }
}
