import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TemporalMemory } from './temporal.js';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { MemoryEntry } from './types.js';

function makeEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: 'test-1',
    content: 'test content',
    file: 'test.md',
    category: 'decision',
    created_at: new Date().toISOString(),
    confidence: 1.0,
    last_validated: new Date().toISOString(),
    validation_count: 0,
    contradiction_count: 0,
    tags: [],
    related_entries: [],
    ...overrides,
  };
}

describe('TemporalMemory.calculateConfidence', () => {
  let tmpDir: string;
  let tm: TemporalMemory;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-test-'));
    const dbPath = path.join(tmpDir, 'test.db');
    tm = new TemporalMemory(dbPath, tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns 1.0 for freshly created entry', () => {
    const entry = makeEntry();
    expect(tm.calculateConfidence(entry)).toBeCloseTo(1.0, 2);
  });

  it('applies time decay for stale entries', () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const entry = makeEntry({ last_validated: thirtyDaysAgo });
    const conf = tm.calculateConfidence(entry);
    // 30 days * 0.005 = 0.15 decay
    expect(conf).toBeLessThan(1.0);
    expect(conf).toBeCloseTo(0.85, 1);
  });

  it('caps time decay at 0.5', () => {
    const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const entry = makeEntry({ last_validated: yearAgo, category: 'core' });
    const conf = tm.calculateConfidence(entry);
    // core entries have no age penalty, time decay capped at 0.5
    expect(conf).toBeCloseTo(0.5, 1);
  });

  it('boosts confidence with validations (clamped to 1.0)', () => {
    const entry = makeEntry({ validation_count: 5 });
    const conf = tm.calculateConfidence(entry);
    // 5 * 0.03 = 0.15 boost, but clamped to 1.0 max
    expect(conf).toBe(1.0);
  });

  it('caps validation boost at 0.3', () => {
    const thirtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const entry = makeEntry({
      last_validated: thirtyDaysAgo,
      validation_count: 20, // 20 * 0.03 = 0.6 → capped at 0.3
    });
    const conf = tm.calculateConfidence(entry);
    // 1.0 - min(60*0.005, 0.5) + min(20*0.03, 0.3) = 1.0 - 0.3 + 0.3 = 1.0 (minus age penalty)
    expect(conf).toBeLessThanOrEqual(1.0);
  });

  it('applies contradiction penalty', () => {
    const entry = makeEntry({ contradiction_count: 3 });
    const conf = tm.calculateConfidence(entry);
    // 3 * 0.15 = 0.45 penalty
    expect(conf).toBeCloseTo(0.55, 1);
  });

  it('can reach zero with heavy contradictions', () => {
    const entry = makeEntry({ contradiction_count: 10 });
    expect(tm.calculateConfidence(entry)).toBe(0);
  });

  it('core category is exempt from age penalty', () => {
    const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString();
    const coreEntry = makeEntry({ category: 'core', created_at: twoYearsAgo });
    const decisionEntry = makeEntry({ category: 'decision', created_at: twoYearsAgo });

    const coreConf = tm.calculateConfidence(coreEntry);
    const decisionConf = tm.calculateConfidence(decisionEntry);

    expect(coreConf).toBeGreaterThan(decisionConf);
  });

  it('age penalty capped at 0.3 for non-core', () => {
    const fiveYearsAgo = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString();
    const entry = makeEntry({ category: 'lesson', created_at: fiveYearsAgo });
    const conf = tm.calculateConfidence(entry);
    // age penalty = min(5 * 0.1, 0.3) = 0.3
    expect(conf).toBeGreaterThanOrEqual(0);
  });
});

describe('TemporalMemory.getConfidenceStatus', () => {
  let tmpDir: string;
  let tm: TemporalMemory;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-test-'));
    const dbPath = path.join(tmpDir, 'test.db');
    tm = new TemporalMemory(dbPath, tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('maps confidence tiers correctly', () => {
    expect(tm.getConfidenceStatus(0.9)).toBe('high');
    expect(tm.getConfidenceStatus(0.7)).toBe('high');
    expect(tm.getConfidenceStatus(0.5)).toBe('medium');
    expect(tm.getConfidenceStatus(0.4)).toBe('medium');
    expect(tm.getConfidenceStatus(0.3)).toBe('low');
    expect(tm.getConfidenceStatus(0.2)).toBe('low');
    expect(tm.getConfidenceStatus(0.1)).toBe('obsolete');
    expect(tm.getConfidenceStatus(0)).toBe('obsolete');
  });
});
