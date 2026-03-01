/**
 * Antigravity OS v2.1 - AST-based Signature Extractor
 * Uses ts-morph to extract only exported API surface (function signatures,
 * interfaces, types, class declarations) from TypeScript/JavaScript files.
 * Falls back gracefully if parsing fails.
 */

import { Project, SyntaxKind, type SourceFile } from "ts-morph";

const project = new Project({ useInMemoryFileSystem: true });

/**
 * Extract minified API surface from a TypeScript/JavaScript file.
 * Returns only exported signatures, interfaces, and type aliases.
 */
export function extractApiSurface(filePath: string, content: string): string | null {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (!ext || !["ts", "tsx", "js", "jsx", "mts", "cts"].includes(ext)) {
    return null;
  }

  try {
    const sourceFile = project.createSourceFile(`__extract_${Date.now()}.${ext}`, content, { overwrite: true });
    const parts: string[] = [];

    extractExportedFunctions(sourceFile, parts);
    extractExportedClasses(sourceFile, parts);
    extractExportedInterfaces(sourceFile, parts);
    extractExportedTypeAliases(sourceFile, parts);
    extractExportedVariables(sourceFile, parts);
    extractExportedEnums(sourceFile, parts);

    project.removeSourceFile(sourceFile);

    return parts.length > 0 ? parts.join("\n\n") : null;
  } catch {
    return null;
  }
}

function extractExportedFunctions(sf: SourceFile, parts: string[]) {
  for (const fn of sf.getFunctions()) {
    if (!fn.isExported()) continue;
    const async = fn.isAsync() ? "async " : "";
    const name = fn.getName() ?? "default";
    const typeParams = fn.getTypeParameters().map((tp) => tp.getText()).join(", ");
    const params = fn.getParameters().map((p) => p.getText()).join(", ");
    const returnType = fn.getReturnTypeNode()?.getText() ?? "";
    const ret = returnType ? `: ${returnType}` : "";
    const tp = typeParams ? `<${typeParams}>` : "";
    parts.push(`export ${async}function ${name}${tp}(${params})${ret};`);
  }
}

function extractExportedClasses(sf: SourceFile, parts: string[]) {
  for (const cls of sf.getClasses()) {
    if (!cls.isExported()) continue;
    const name = cls.getName() ?? "default";
    const ext = cls.getExtends()?.getText();
    const impls = cls.getImplements().map((i) => i.getText()).join(", ");
    const header = `export class ${name}${ext ? ` extends ${ext}` : ""}${impls ? ` implements ${impls}` : ""}`;

    const members: string[] = [];
    for (const method of cls.getMethods()) {
      if (method.getScope() === "private") continue;
      const async = method.isAsync() ? "async " : "";
      const mName = method.getName();
      const params = method.getParameters().map((p) => p.getText()).join(", ");
      const retNode = method.getReturnTypeNode()?.getText() ?? "";
      const ret = retNode ? `: ${retNode}` : "";
      members.push(`  ${async}${mName}(${params})${ret};`);
    }

    for (const prop of cls.getProperties()) {
      if (prop.getScope() === "private") continue;
      const name = prop.getName();
      const typeNode = prop.getTypeNode()?.getText();
      const type = typeNode ? `: ${typeNode}` : "";
      members.push(`  ${name}${type};`);
    }

    for (const ctor of cls.getConstructors()) {
      const params = ctor.getParameters().map((p) => p.getText()).join(", ");
      members.push(`  constructor(${params});`);
    }

    parts.push(`${header} {\n${members.join("\n")}\n}`);
  }
}

function extractExportedInterfaces(sf: SourceFile, parts: string[]) {
  for (const iface of sf.getInterfaces()) {
    if (!iface.isExported()) continue;
    parts.push(iface.getText());
  }
}

function extractExportedTypeAliases(sf: SourceFile, parts: string[]) {
  for (const ta of sf.getTypeAliases()) {
    if (!ta.isExported()) continue;
    parts.push(ta.getText());
  }
}

function extractExportedVariables(sf: SourceFile, parts: string[]) {
  for (const stmt of sf.getVariableStatements()) {
    if (!stmt.isExported()) continue;
    for (const decl of stmt.getDeclarations()) {
      const name = decl.getName();
      const typeNode = decl.getTypeNode()?.getText();
      const type = typeNode ? `: ${typeNode}` : "";
      parts.push(`export const ${name}${type};`);
    }
  }
}

function extractExportedEnums(sf: SourceFile, parts: string[]) {
  for (const en of sf.getEnums()) {
    if (!en.isExported()) continue;
    parts.push(en.getText());
  }
}
