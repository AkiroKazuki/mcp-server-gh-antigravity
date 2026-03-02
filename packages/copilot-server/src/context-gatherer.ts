/**
 * Antigravity OS v2.0 - Context Gatherer
 * Extracts imports, type definitions, signatures, and recent changes to build
 * context for Copilot prompts. Limits output to 10000 chars.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { extractApiSurface } from './ast-extractor.js';

const execFileAsync = promisify(execFile);

const MAX_CONTEXT_LENGTH = 10000;

export class ContextGatherer {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  async gatherContext(
    targetFile: string,
    options?: {
      maxDepth?: number;
      includeTypes?: boolean;
      includeGitDiff?: boolean;
    }
  ): Promise<string> {
    const absFile = path.isAbsolute(targetFile)
      ? targetFile
      : path.join(this.projectRoot, targetFile);

    const sections: string[] = [];
    const relFile = path.relative(this.projectRoot, absFile);

    sections.push(`# Context for ${relFile}\n`);

    // Extract imports and resolve them
    try {
      const imports = await this.extractImports(absFile);
      if (imports.length > 0) {
        sections.push('## Imports\n');
        const baseDir = path.dirname(absFile);
        const maxDepth = options?.maxDepth ?? 1;

        for (const imp of imports) {
          const resolved = await this.resolveImport(imp, baseDir);
          if (resolved) {
            sections.push(`- \`${imp}\` -> \`${path.relative(this.projectRoot, resolved)}\``);

            if (maxDepth > 0) {
              try {
                // Use AST-based extraction for minified API surface
                const depContent = await fs.readFile(resolved, 'utf-8');
                const astSurface = extractApiSurface(resolved, depContent);
                const sigs = astSurface ?? await this.extractSignatures(resolved);
                if (sigs.trim()) {
                  sections.push('  ```');
                  sections.push('  ' + sigs.split('\n').join('\n  '));
                  sections.push('  ```');
                }
              } catch {
                // Could not extract signatures from resolved import
              }
            }
          } else {
            sections.push(`- \`${imp}\` (external or unresolved)`);
          }
        }
        sections.push('');
      }
    } catch {
      // Could not read file for imports
    }

    // Extract signatures from the target file itself
    try {
      const signatures = await this.extractSignatures(absFile);
      if (signatures.trim()) {
        sections.push('## Exported Signatures\n');
        sections.push('```');
        sections.push(signatures);
        sections.push('```\n');
      }
    } catch {
      // Could not extract signatures
    }

    // Extract type definitions
    const includeTypes = options?.includeTypes ?? true;
    if (includeTypes) {
      try {
        const typeDefs = await this.extractTypeDefinitions(absFile);
        if (typeDefs.trim()) {
          sections.push('## Type Definitions\n');
          sections.push('```typescript');
          sections.push(typeDefs);
          sections.push('```\n');
        }
      } catch {
        // Could not extract type definitions
      }
    }

    // Find base classes
    try {
      const baseClasses = await this.findBaseClasses(absFile);
      if (baseClasses.length > 0) {
        sections.push('## Inheritance\n');
        for (const bc of baseClasses) {
          sections.push(`- Extends/Implements: \`${bc}\``);
        }
        sections.push('');
      }
    } catch {
      // Could not find base classes
    }

    // Recent related changes
    const includeGitDiff = options?.includeGitDiff ?? true;
    if (includeGitDiff) {
      try {
        const changes = await this.getRecentRelatedChanges(absFile);
        if (changes.trim()) {
          sections.push('## Recent Changes in Directory\n');
          sections.push('```diff');
          sections.push(changes);
          sections.push('```\n');
        }
      } catch {
        // Could not get git diff
      }
    }

    let result = sections.join('\n');
    if (result.length > MAX_CONTEXT_LENGTH) {
      result = result.slice(0, MAX_CONTEXT_LENGTH - 50) + '\n\n... (truncated to fit context limit)';
    }

    return result;
  }

  async extractImports(filePath: string): Promise<string[]> {
    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch {
      return [];
    }

    const imports: string[] = [];

    // ES module: import ... from '...'
    const esImportRe = /import\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = esImportRe.exec(content)) !== null) {
      imports.push(match[1]);
    }

    // Side-effect import: import '...'
    const sideEffectRe = /import\s+['"]([^'"]+)['"]/g;
    while ((match = sideEffectRe.exec(content)) !== null) {
      imports.push(match[1]);
    }

    // CommonJS: require('...')
    const requireRe = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = requireRe.exec(content)) !== null) {
      imports.push(match[1]);
    }

    // Python: from ... import ...
    const pythonFromRe = /^from\s+(\S+)\s+import\s+/gm;
    while ((match = pythonFromRe.exec(content)) !== null) {
      imports.push(match[1]);
    }

    // Python: import ...
    const pythonImportRe = /^import\s+(\S+)/gm;
    while ((match = pythonImportRe.exec(content)) !== null) {
      // Avoid matching TypeScript/ES imports already caught
      if (!content.includes('from') || !match[0].includes('{')) {
        const mod = match[1].replace(/,.*/, '');
        if (!imports.includes(mod)) {
          imports.push(mod);
        }
      }
    }

    // Deduplicate
    return [...new Set(imports)];
  }

  async resolveImport(importRef: string, baseDir: string): Promise<string | null> {
    // Skip bare specifiers that are clearly packages
    if (!importRef.startsWith('.') && !importRef.startsWith('/')) {
      // Try node_modules
      const nodeModulePath = path.join(this.projectRoot, 'node_modules', importRef);
      try {
        await fs.access(nodeModulePath);
        return nodeModulePath;
      } catch {
        return null;
      }
    }

    // Relative path resolution
    const basePath = path.resolve(baseDir, importRef);
    const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '/index.ts', '/index.js'];

    for (const ext of extensions) {
      const candidate = basePath + ext;
      try {
        const stat = await fs.stat(candidate);
        if (stat.isFile()) {
          return candidate;
        }
      } catch {
        // Try next extension
      }
    }

    // Handle .js extension mapping to .ts (common in ESM TypeScript projects)
    if (importRef.endsWith('.js')) {
      const tsPath = path.resolve(baseDir, importRef.replace(/\.js$/, '.ts'));
      try {
        const stat = await fs.stat(tsPath);
        if (stat.isFile()) {
          return tsPath;
        }
      } catch {
        // Not found
      }
    }

    return null;
  }

  async extractSignatures(filePath: string): Promise<string> {
    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch {
      return '';
    }

    const signaturePatterns = [
      // export (async) function name(...)
      /^export\s+(async\s+)?function\s+\w+[^{]*/gm,
      // export class name (extends/implements)
      /^export\s+(abstract\s+)?class\s+\w+[^{]*/gm,
      // export interface name
      /^export\s+interface\s+\w+[^{]*/gm,
      // export type name =
      /^export\s+type\s+\w+\s*(?:<[^>]*>)?\s*=/gm,
      // export const name: Type = or export const name =
      /^export\s+const\s+\w+\s*(?::[^=]+)?=/gm,
      // export default function/class
      /^export\s+default\s+(async\s+)?function\s+\w+[^{]*/gm,
      /^export\s+default\s+class\s+\w+[^{]*/gm,
    ];

    const signatures: string[] = [];

    for (const pattern of signaturePatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        const sig = match[0].trim();
        if (!signatures.includes(sig)) {
          signatures.push(sig);
        }
      }
    }

    return signatures.join('\n');
  }

  async findBaseClasses(filePath: string): Promise<string[]> {
    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch {
      return [];
    }

    const results: string[] = [];

    // extends clause
    const extendsRe = /class\s+\w+\s+extends\s+([\w.]+)/g;
    let match: RegExpExecArray | null;
    while ((match = extendsRe.exec(content)) !== null) {
      results.push(match[1]);
    }

    // implements clause (may have multiple)
    const implementsRe = /class\s+\w+(?:\s+extends\s+[\w.]+)?\s+implements\s+([\w.,\s]+)/g;
    while ((match = implementsRe.exec(content)) !== null) {
      const impls = match[1].split(',').map((s) => s.trim()).filter(Boolean);
      results.push(...impls);
    }

    return [...new Set(results)];
  }

  async getRecentRelatedChanges(filePath: string): Promise<string> {
    const dirName = path.dirname(filePath);
    const maxChars = 2000;

    try {
      const { stdout } = await execFileAsync(
        'git',
        ['diff', 'HEAD~5', '--', dirName],
        {
          cwd: this.projectRoot,
          timeout: 5000,
          maxBuffer: 1024 * 1024,
        }
      );

      if (stdout.length > maxChars) {
        return stdout.slice(0, maxChars) + '\n... (truncated)';
      }

      return stdout;
    } catch {
      // Git not available or not a git repo or not enough history
      return '';
    }
  }

  async extractTypeDefinitions(filePath: string): Promise<string> {
    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch {
      return '';
    }

    const typeBlocks: string[] = [];
    const lines = content.split('\n');
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Match interface or type declarations
      if (/^\s*(export\s+)?(interface|type)\s+\w+/.test(line)) {
        const block: string[] = [line];
        let braceDepth = 0;

        // Count braces on the declaration line
        for (const ch of line) {
          if (ch === '{') braceDepth++;
          if (ch === '}') braceDepth--;
        }

        // If it's a single-line type alias (no braces or balanced braces), just take the line
        if (braceDepth === 0 && (line.includes('=') || line.includes('}'))) {
          typeBlocks.push(block.join('\n'));
          i++;
          continue;
        }

        // Multi-line: read until braces balance
        i++;
        while (i < lines.length && braceDepth > 0) {
          block.push(lines[i]);
          for (const ch of lines[i]) {
            if (ch === '{') braceDepth++;
            if (ch === '}') braceDepth--;
          }
          i++;
        }

        // If braces never opened, might be a type = ... spanning lines
        if (braceDepth === 0) {
          typeBlocks.push(block.join('\n'));
        }
        continue;
      }

      i++;
    }

    return typeBlocks.join('\n\n');
  }
}
