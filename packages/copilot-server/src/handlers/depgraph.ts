import { respond, respondError } from "@antigravity-os/shared";
import type { CopilotContext } from "./types.js";
import type { DependencyGraphArgs } from "../schemas.js";
import fs from "node:fs";
import path from "node:path";

const IMPORT_RE = /(?:import\s+.*?from\s+['"](.+?)['"]|require\s*\(\s*['"](.+?)['"]\s*\)|export\s+.*?from\s+['"](.+?)['"])/g;
const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

function resolveImportPath(fromFile: string, importSpecifier: string): string | null {
  // Skip node_modules / bare specifiers
  if (!importSpecifier.startsWith(".") && !importSpecifier.startsWith("/")) {
    return null;
  }

  const dir = path.dirname(fromFile);
  const base = path.resolve(dir, importSpecifier);

  // Try exact path first, then with extensions
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  for (const ext of EXTENSIONS) {
    const withExt = base + ext;
    if (fs.existsSync(withExt)) return withExt;
  }
  // Try index files
  for (const ext of EXTENSIONS) {
    const indexPath = path.join(base, `index${ext}`);
    if (fs.existsSync(indexPath)) return indexPath;
  }
  return null;
}

function extractImports(filePath: string): string[] {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, "utf-8");
  const imports: string[] = [];

  let match: RegExpExecArray | null;
  IMPORT_RE.lastIndex = 0;
  while ((match = IMPORT_RE.exec(content)) !== null) {
    const specifier = match[1] || match[2] || match[3];
    if (specifier) {
      const resolved = resolveImportPath(filePath, specifier);
      if (resolved) imports.push(resolved);
    }
  }
  return imports;
}

interface GraphNode {
  file: string;
  imports: string[];
  depth: number;
}

function buildUpstreamGraph(entryFile: string, maxDepth: number): GraphNode[] {
  const visited = new Set<string>();
  const nodes: GraphNode[] = [];

  function walk(file: string, depth: number) {
    const abs = path.resolve(file);
    if (visited.has(abs) || depth > maxDepth) return;
    visited.add(abs);

    const imports = extractImports(abs);
    nodes.push({ file: abs, imports, depth });

    for (const imp of imports) {
      walk(imp, depth + 1);
    }
  }

  walk(entryFile, 0);
  return nodes;
}

function findDownstreamFiles(targetFile: string, projectRoot: string, maxDepth: number, visited?: Set<string>): string[] {
  const absTarget = path.resolve(targetFile);
  const seen = visited ?? new Set<string>();
  if (seen.has(absTarget)) return [];
  seen.add(absTarget);

  const downstream = new Set<string>();

  function scanDir(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
        const imports = extractImports(fullPath);
        if (imports.some((imp) => path.resolve(imp) === absTarget)) {
          downstream.add(fullPath);
        }
      }
    }
  }

  scanDir(projectRoot);

  // Recurse for depth > 1
  if (maxDepth > 1) {
    const nextLevel = new Set<string>();
    for (const file of downstream) {
      const deeper = findDownstreamFiles(file, projectRoot, maxDepth - 1, seen);
      for (const d of deeper) nextLevel.add(d);
    }
    for (const d of nextLevel) downstream.add(d);
  }

  return [...downstream];
}

export async function handleDependencyGraph(ctx: CopilotContext, args: DependencyGraphArgs) {
  const { entry_file } = args;
  const depth = args.depth ?? 3;
  const direction = args.direction ?? "both";

  const absEntry = path.resolve(entry_file);
  if (!fs.existsSync(absEntry)) {
    return respondError(`File not found: ${entry_file}`);
  }

  const projectRoot = process.env.PROJECT_ROOT || process.cwd();
  const result: Record<string, unknown> = { entry_file: absEntry, direction, depth };

  if (direction === "upstream" || direction === "both") {
    const upstream = buildUpstreamGraph(absEntry, depth);
    result.upstream = upstream.map((n) => ({
      file: path.relative(projectRoot, n.file),
      imports: n.imports.map((i) => path.relative(projectRoot, i)),
      depth: n.depth,
    }));
    result.upstream_count = upstream.length;
  }

  if (direction === "downstream" || direction === "both") {
    const downstream = findDownstreamFiles(absEntry, projectRoot, depth);
    result.downstream = downstream.map((f) => path.relative(projectRoot, f));
    result.downstream_count = downstream.length;
  }

  const totalFiles = (result.upstream_count as number ?? 0) + (result.downstream_count as number ?? 0);

  return respond({
    status: "success",
    operation: "copilot_dependency_graph",
    summary: `Dependency graph for ${path.basename(absEntry)}: ${totalFiles} connected files`,
    metadata: result,
  });
}
