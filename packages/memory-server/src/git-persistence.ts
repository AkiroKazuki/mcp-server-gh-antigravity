import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";

const execFileAsync = promisify(execFile);

/**
 * Git-backed persistence for .memory/ directory.
 * Auto-commits every change, supports history viewing and rollback.
 */
export class GitPersistence {
  private memoryPath: string;
  private initialized: boolean = false;

  constructor(memoryPath: string) {
    this.memoryPath = memoryPath;
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      await execFileAsync("git", ["rev-parse", "--git-dir"], {
        cwd: this.memoryPath,
      });
      this.initialized = true;
    } catch {
      try {
        await fs.mkdir(this.memoryPath, { recursive: true });
        await execFileAsync("git", ["init"], { cwd: this.memoryPath });

        // Create .gitignore for semantic index (large file, regenerable)
        const gitignorePath = path.join(this.memoryPath, ".gitignore");
        await fs.writeFile(gitignorePath, "semantic-index.json\n", "utf-8");

        await execFileAsync("git", ["add", "."], { cwd: this.memoryPath });
        await execFileAsync("git", ["commit", "-m", "Initial memory state", "--allow-empty"], {
          cwd: this.memoryPath,
        });
        this.initialized = true;
        console.error("[git] Initialized git for .memory/");
      } catch (err: any) {
        console.error(`[git] Failed to initialize: ${err.message}`);
      }
    }
  }

  async commitChanges(
    file: string,
    operation: string,
    description: string
  ): Promise<void> {
    await this.init();

    try {
      // Get relative path from memory root
      const relPath = path.relative(this.memoryPath, file);
      await execFileAsync("git", ["add", relPath], { cwd: this.memoryPath });

      const timestamp = new Date().toISOString();
      const message = `[${operation}] ${description}\n\nTimestamp: ${timestamp}`;

      await execFileAsync("git", ["commit", "-m", message], {
        cwd: this.memoryPath,
      });
      console.error(`[git] Committed: ${relPath}`);
    } catch (err: any) {
      if (!err.message?.includes("nothing to commit")) {
        console.error(`[git] Commit failed: ${err.message}`);
      }
    }
  }

  async getHistory(
    file: string,
    limit: number = 10
  ): Promise<Array<{ hash: string; message: string }>> {
    await this.init();

    try {
      const relPath = path.relative(this.memoryPath, file);
      const { stdout } = await execFileAsync(
        "git",
        ["log", "--oneline", `-${limit}`, "--", relPath],
        { cwd: this.memoryPath }
      );

      if (!stdout.trim()) return [];

      return stdout
        .trim()
        .split("\n")
        .map((line) => {
          const spaceIdx = line.indexOf(" ");
          return {
            hash: line.slice(0, spaceIdx),
            message: line.slice(spaceIdx + 1),
          };
        });
    } catch {
      return [];
    }
  }

  async rollback(file: string, commitHash: string): Promise<void> {
    await this.init();

    const relPath = path.relative(this.memoryPath, file);

    // Validate commit hash (alphanumeric only)
    if (!/^[a-f0-9]+$/i.test(commitHash)) {
      throw new Error(`Invalid commit hash: ${commitHash}`);
    }

    await execFileAsync("git", ["checkout", commitHash, "--", relPath], {
      cwd: this.memoryPath,
    });

    await this.commitChanges(
      file,
      "ROLLBACK",
      `Rolled back ${path.basename(file)} to ${commitHash}`
    );
  }

  async getDiff(file: string, commitHash?: string): Promise<string> {
    await this.init();

    const relPath = path.relative(this.memoryPath, file);

    try {
      const args = commitHash
        ? ["diff", commitHash, "HEAD", "--", relPath]
        : ["diff", "HEAD~1", "HEAD", "--", relPath];

      const { stdout } = await execFileAsync("git", args, {
        cwd: this.memoryPath,
      });
      return stdout;
    } catch {
      return "";
    }
  }

  /**
   * Get recent commit hashes and messages across all files.
   */
  async getRecentOperations(limit: number = 10): Promise<Array<{
    hash: string;
    message: string;
    timestamp: string;
    files: string[];
  }>> {
    await this.init();

    try {
      const { stdout } = await execFileAsync(
        "git",
        ["log", `--format=%H|%s|%aI`, `-${limit}`],
        { cwd: this.memoryPath }
      );

      if (!stdout.trim()) return [];

      const results: Array<{ hash: string; message: string; timestamp: string; files: string[] }> = [];

      for (const line of stdout.trim().split("\n")) {
        const [hash, message, timestamp] = line.split("|");
        if (!hash) continue;

        // Get files changed in this commit
        let files: string[] = [];
        try {
          const { stdout: fileOutput } = await execFileAsync(
            "git",
            ["diff-tree", "--no-commit-id", "--name-only", "-r", hash],
            { cwd: this.memoryPath }
          );
          files = fileOutput.trim().split("\n").filter(Boolean);
        } catch { /* ignore */ }

        results.push({ hash, message, timestamp, files });
      }

      return results;
    } catch {
      return [];
    }
  }

  /**
   * Get the latest commit hash (HEAD).
   */
  async getLatestCommitHash(): Promise<string | null> {
    await this.init();

    try {
      const { stdout } = await execFileAsync(
        "git",
        ["rev-parse", "HEAD"],
        { cwd: this.memoryPath }
      );
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  /**
   * Commit all changes (for bulk operations).
   */
  async commitAll(operation: string, description: string): Promise<string | null> {
    await this.init();

    try {
      await execFileAsync("git", ["add", "-A"], { cwd: this.memoryPath });

      const timestamp = new Date().toISOString();
      const message = `[${operation}] ${description}\n\nTimestamp: ${timestamp}`;

      await execFileAsync("git", ["commit", "-m", message], {
        cwd: this.memoryPath,
      });

      return await this.getLatestCommitHash();
    } catch (err: any) {
      if (!err.message?.includes("nothing to commit")) {
        console.error(`[git] CommitAll failed: ${err.message}`);
      }
      return null;
    }
  }
}
