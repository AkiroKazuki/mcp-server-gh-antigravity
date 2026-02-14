/**
 * File-level locking with FIFO queue for concurrent write safety.
 * Prevents corruption when multiple tasks try to write to the same file.
 */
export declare class FileLockManager {
    private locks;
    private queues;
    acquireLock(filepath: string): Promise<() => void>;
    withLock<T>(filepath: string, operation: () => Promise<T>): Promise<T>;
    isLocked(filepath: string): boolean;
    getQueueLength(filepath: string): number;
    getActiveLocks(): Array<{
        file: string;
        queueLength: number;
    }>;
}
