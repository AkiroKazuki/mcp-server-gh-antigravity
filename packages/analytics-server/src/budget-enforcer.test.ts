import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BudgetEnforcer } from './budget-enforcer.js';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('BudgetEnforcer', () => {
  let tmpDir: string;
  let enforcer: BudgetEnforcer;
  let db: Database.Database;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-budget-'));
    const memDir = path.join(tmpDir, '.memory');
    fs.mkdirSync(path.join(memDir, 'config'), { recursive: true });
    fs.mkdirSync(path.join(memDir, 'snapshots'), { recursive: true });

    // Initialize DB with cost_log table
    const dbPath = path.join(memDir, 'antigravity.db');
    db = new Database(dbPath, { timeout: 5000 });
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS cost_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        agent TEXT NOT NULL,
        tokens INTEGER NOT NULL,
        cost_usd REAL NOT NULL,
        task_description TEXT,
        timestamp TEXT NOT NULL,
        duration_ms REAL
      )
    `);

    enforcer = new BudgetEnforcer(tmpDir);
    await enforcer.loadConfig();
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('allows budget when no costs logged', async () => {
    const result = await enforcer.checkBudget(1000, 'antigravity');
    expect(result.allowed).toBe(true);
    expect(result.today_spend).toBe(0);
  });

  it('calculates operation cost for antigravity agent', async () => {
    const result = await enforcer.checkBudget(1000, 'antigravity');
    // Default antigravity_input = 0.015 per 1K tokens
    expect(result.operation_cost).toBeCloseTo(0.015, 4);
  });

  it('zero cost for non-antigravity agents', async () => {
    const result = await enforcer.checkBudget(10000, 'copilot');
    expect(result.operation_cost).toBe(0);
  });

  it('denies budget when limit exceeded', async () => {
    const today = new Date().toISOString().split('T')[0];
    // Insert costs that exceed the $5 default daily limit
    db.prepare(
      `INSERT INTO cost_log (date, agent, tokens, cost_usd, timestamp) VALUES (?, ?, ?, ?, ?)`
    ).run(today, 'test', 100000, 5.50, new Date().toISOString());

    const result = await enforcer.checkBudget(1000, 'antigravity');
    expect(result.allowed).toBe(false);
    expect(result.warning).toContain('BUDGET EXCEEDED');
  });

  it('warns when approaching threshold', async () => {
    const today = new Date().toISOString().split('T')[0];
    // Insert cost at 85% of $5 limit (default threshold is 80%)
    db.prepare(
      `INSERT INTO cost_log (date, agent, tokens, cost_usd, timestamp) VALUES (?, ?, ?, ?, ?)`
    ).run(today, 'test', 50000, 4.25, new Date().toISOString());

    const result = await enforcer.checkBudget(1, 'copilot');
    expect(result.allowed).toBe(true);
    expect(result.warning).toContain('Approaching daily limit');
  });

  it('getSpendForPeriod filters correctly', async () => {
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const monthAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    db.prepare(`INSERT INTO cost_log (date, agent, tokens, cost_usd, timestamp) VALUES (?, ?, ?, ?, ?)`)
      .run(today, 'a', 100, 0.10, new Date().toISOString());
    db.prepare(`INSERT INTO cost_log (date, agent, tokens, cost_usd, timestamp) VALUES (?, ?, ?, ?, ?)`)
      .run(weekAgo, 'b', 200, 0.20, new Date().toISOString());
    db.prepare(`INSERT INTO cost_log (date, agent, tokens, cost_usd, timestamp) VALUES (?, ?, ?, ?, ?)`)
      .run(monthAgo, 'c', 300, 0.30, new Date().toISOString());

    const todayData = await enforcer.getSpendForPeriod('today');
    expect(todayData.entries).toHaveLength(1);
    expect(todayData.total_cost).toBeCloseTo(0.10, 4);

    const weekData = await enforcer.getSpendForPeriod('week');
    expect(weekData.entries.length).toBeGreaterThanOrEqual(1);

    const allData = await enforcer.getSpendForPeriod('all');
    expect(allData.entries).toHaveLength(3);
    expect(allData.total_cost).toBeCloseTo(0.60, 4);
  });
});
