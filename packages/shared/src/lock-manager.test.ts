import { describe, it, expect } from 'vitest';
import { FileLockManager } from './lock-manager.js';

describe('FileLockManager', () => {
  it('acquires and releases lock', async () => {
    const mgr = new FileLockManager();
    expect(mgr.isLocked('test.txt')).toBe(false);

    const release = await mgr.acquireLock('test.txt');
    expect(mgr.isLocked('test.txt')).toBe(true);

    release();
    expect(mgr.isLocked('test.txt')).toBe(false);
  });

  it('queues concurrent lock requests (FIFO)', async () => {
    const mgr = new FileLockManager();
    const order: number[] = [];

    const release1 = await mgr.acquireLock('file.txt');
    expect(mgr.getQueueLength('file.txt')).toBe(0);

    // Queue two more acquisitions
    const p2 = mgr.acquireLock('file.txt').then(release => {
      order.push(2);
      return release;
    });
    const p3 = mgr.acquireLock('file.txt').then(release => {
      order.push(3);
      return release;
    });

    expect(mgr.getQueueLength('file.txt')).toBe(2);

    release1();
    const release2 = await p2;
    release2();
    const release3 = await p3;
    release3();

    expect(order).toEqual([2, 3]);
  });

  it('withLock executes callback under lock', async () => {
    const mgr = new FileLockManager();
    let wasLocked = false;

    await mgr.withLock('data.json', async () => {
      wasLocked = mgr.isLocked('data.json');
    });

    expect(wasLocked).toBe(true);
    expect(mgr.isLocked('data.json')).toBe(false);
  });

  it('withLock releases on error', async () => {
    const mgr = new FileLockManager();

    await expect(
      mgr.withLock('err.txt', async () => { throw new Error('fail'); })
    ).rejects.toThrow('fail');

    expect(mgr.isLocked('err.txt')).toBe(false);
  });

  it('tracks active locks', async () => {
    const mgr = new FileLockManager();
    const r1 = await mgr.acquireLock('a.txt');
    const r2 = await mgr.acquireLock('b.txt');

    const locks = mgr.getActiveLocks();
    expect(locks).toHaveLength(2);
    expect(locks.map((l: any) => typeof l === 'string' ? l : l.file)).toEqual(
      expect.arrayContaining([expect.stringContaining('a.txt'), expect.stringContaining('b.txt')])
    );

    r1();
    expect(mgr.getActiveLocks()).toHaveLength(1);
    r2();
    expect(mgr.getActiveLocks()).toHaveLength(0);
  });

  it('independent locks do not block each other', async () => {
    const mgr = new FileLockManager();
    const r1 = await mgr.acquireLock('x.txt');
    const r2 = await mgr.acquireLock('y.txt');

    expect(mgr.isLocked('x.txt')).toBe(true);
    expect(mgr.isLocked('y.txt')).toBe(true);

    r1();
    r2();
  });
});
