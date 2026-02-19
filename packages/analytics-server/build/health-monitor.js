/**
 * Antigravity OS v2.0 - Health Monitor
 * Checks system component health: disk, git, semantic index, budget, memory files.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
export class HealthMonitor {
    projectRoot;
    memoryPath;
    constructor(projectRoot) {
        this.projectRoot = projectRoot;
        this.memoryPath = path.join(projectRoot, process.env.MEMORY_DIR || '.memory');
    }
    async check() {
        const components = {};
        const alerts = [];
        const recommendations = [];
        // Check memory files
        components['memory_files'] = await this.checkMemoryFiles();
        if (components['memory_files'].status !== 'healthy') {
            alerts.push('Memory file issues detected');
        }
        // Check git repo
        components['git'] = await this.checkGitRepo();
        if (components['git'].status !== 'healthy') {
            alerts.push('Git repository issues detected');
        }
        // Check semantic index
        components['semantic_index'] = await this.checkSemanticIndex();
        if (components['semantic_index'].status === 'unhealthy') {
            recommendations.push('Run reindex_memory to rebuild semantic search index');
        }
        // Check budget
        components['budget'] = await this.checkBudget();
        if (components['budget'].status === 'degraded') {
            alerts.push('Budget approaching limit');
        }
        // Check database
        components['database'] = await this.checkDatabase();
        if (components['database'].status !== 'healthy') {
            alerts.push('Database issues detected');
        }
        // Check disk space
        components['disk'] = await this.checkDiskSpace();
        if (components['disk'].status !== 'healthy') {
            alerts.push('Low disk space');
        }
        // Determine overall status
        const statuses = Object.values(components).map((c) => c.status);
        let overall_status = 'healthy';
        if (statuses.includes('unhealthy')) {
            overall_status = 'unhealthy';
        }
        else if (statuses.includes('degraded')) {
            overall_status = 'degraded';
        }
        return { overall_status, components, alerts, recommendations };
    }
    async checkMemoryFiles() {
        const requiredDirs = ['core', 'active', 'decisions', 'lessons', 'snapshots', 'config'];
        const missing = [];
        for (const dir of requiredDirs) {
            try {
                await fs.access(path.join(this.memoryPath, dir));
            }
            catch {
                missing.push(dir);
            }
        }
        if (missing.length === 0) {
            // Count files
            let fileCount = 0;
            try {
                const entries = await fs.readdir(this.memoryPath, { recursive: true });
                fileCount = entries.length;
            }
            catch { /* ignore */ }
            return {
                status: 'healthy',
                details: { directories: requiredDirs.length, total_entries: fileCount },
            };
        }
        if (missing.length <= 2) {
            return {
                status: 'degraded',
                details: { missing_directories: missing },
                last_error: `Missing directories: ${missing.join(', ')}`,
            };
        }
        return {
            status: 'unhealthy',
            details: { missing_directories: missing },
            last_error: `Many directories missing: ${missing.join(', ')}`,
        };
    }
    async checkGitRepo() {
        try {
            const { stdout } = await execFileAsync('git', ['rev-parse', '--git-dir'], {
                cwd: this.memoryPath,
            });
            // Check for uncommitted changes
            const { stdout: status } = await execFileAsync('git', ['status', '--porcelain'], {
                cwd: this.memoryPath,
            });
            const uncommitted = status.trim().split('\n').filter(Boolean).length;
            // Get recent commit count
            let recentCommits = 0;
            try {
                const { stdout: logOut } = await execFileAsync('git', ['log', '--oneline', '--since=7 days ago'], { cwd: this.memoryPath });
                recentCommits = logOut.trim().split('\n').filter(Boolean).length;
            }
            catch { /* ignore */ }
            return {
                status: uncommitted > 10 ? 'degraded' : 'healthy',
                details: {
                    initialized: true,
                    git_dir: stdout.trim(),
                    uncommitted_changes: uncommitted,
                    recent_commits_7d: recentCommits,
                },
            };
        }
        catch {
            return {
                status: 'unhealthy',
                details: { initialized: false },
                last_error: 'Git repository not initialized in .memory/',
            };
        }
    }
    async checkSemanticIndex() {
        const indexPath = path.join(this.memoryPath, 'semantic-index.json');
        try {
            const stat = await fs.stat(indexPath);
            const ageHours = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60);
            const sizeKB = Math.round(stat.size / 1024);
            let chunkCount = 0;
            try {
                const data = JSON.parse(await fs.readFile(indexPath, 'utf-8'));
                chunkCount = data.chunks?.length || 0;
            }
            catch { /* ignore */ }
            const status = ageHours > 168 ? 'degraded' : // > 7 days
                ageHours > 720 ? 'unhealthy' : // > 30 days
                    'healthy';
            return {
                status,
                details: {
                    exists: true,
                    size_kb: sizeKB,
                    age_hours: Math.round(ageHours),
                    chunk_count: chunkCount,
                },
            };
        }
        catch {
            return {
                status: 'unhealthy',
                details: { exists: false },
                last_error: 'Semantic index not found. Run reindex_memory to create it.',
            };
        }
    }
    async checkBudget() {
        const configPath = path.join(this.memoryPath, 'config', 'budget.json');
        const costsPath = path.join(this.memoryPath, 'snapshots', 'costs.jsonl');
        try {
            const configData = await fs.readFile(configPath, 'utf-8');
            const config = JSON.parse(configData);
            let todaySpend = 0;
            try {
                const costs = await fs.readFile(costsPath, 'utf-8');
                const today = new Date().toISOString().split('T')[0];
                const entries = costs.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
                todaySpend = entries
                    .filter((e) => e.date === today)
                    .reduce((s, e) => s + (e.cost_usd || 0), 0);
            }
            catch { /* no costs yet */ }
            const dailyUsage = todaySpend / (config.daily_limit_usd || 2);
            return {
                status: dailyUsage > 0.9 ? 'degraded' : 'healthy',
                details: {
                    daily_limit: config.daily_limit_usd,
                    today_spend: Math.round(todaySpend * 10000) / 10000,
                    daily_usage_pct: Math.round(dailyUsage * 100),
                    emergency_override: config.emergency_override || false,
                },
            };
        }
        catch {
            return {
                status: 'degraded',
                details: { config_exists: false },
                last_error: 'Budget config not found — using defaults',
            };
        }
    }
    async checkDatabase() {
        const dbPath = path.join(this.memoryPath, 'antigravity.db');
        try {
            const stat = await fs.stat(dbPath);
            const sizeKB = Math.round(stat.size / 1024);
            return {
                status: 'healthy',
                details: {
                    exists: true,
                    size_kb: sizeKB,
                    path: dbPath,
                },
            };
        }
        catch {
            return {
                status: 'degraded',
                details: { exists: false },
                last_error: 'Database not found — will be created on first use',
            };
        }
    }
    async checkDiskSpace() {
        try {
            const { stdout } = await execFileAsync('df', ['-k', this.memoryPath]);
            const lines = stdout.trim().split('\n');
            if (lines.length >= 2) {
                const parts = lines[1].split(/\s+/);
                const availKB = parseInt(parts[3], 10);
                const capacityStr = parts[4]?.replace('%', '') || '0';
                const usedPct = parseInt(capacityStr, 10);
                return {
                    status: usedPct > 95 ? 'unhealthy' : usedPct > 90 ? 'degraded' : 'healthy',
                    details: {
                        available_mb: Math.round(availKB / 1024),
                        used_percent: usedPct,
                    },
                };
            }
            return { status: 'healthy', details: {} };
        }
        catch {
            return {
                status: 'healthy',
                details: { note: 'Could not check disk space' },
            };
        }
    }
}
