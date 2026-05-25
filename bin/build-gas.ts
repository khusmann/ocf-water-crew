// Builds the Apps Script deploy directory at dist/. tsc emits all of
// src/**/*.ts into build/; this script then strips ES module syntax
// and emits each non-empty .js into dist/ flat-named, since GAS files
// share a single global scope and discover each other by name.
//
// Excludes:
//   - index.ts barrels (their entire body is re-exports → empty after strip)
//   - type-only modules (types.ts) — same reason
//
// Naming: dist/<basename>.js. Basenames across src/ are kept unique
// for this reason — if a collision shows up the build throws.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const buildDir = path.join(repoRoot, "build");
const distDir = path.join(repoRoot, "dist");

const HEADER = (sourceFile: string) =>
  `// Generated from ${sourceFile} by bin/build-gas.ts — do not edit.
// To regenerate: npm run build
`;

fs.rmSync(buildDir, { recursive: true, force: true });
fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

const tsc = spawnSync(
  "npx",
  ["tsc", "-p", path.join(repoRoot, "tsconfig.json")],
  { cwd: repoRoot, stdio: "inherit" }
);
if (tsc.status !== 0) {
  process.exit(tsc.status ?? 1);
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

function stripModuleSyntax(body: string): string {
  // Re-export forms (`export * from "..."`, `export { x } from "..."`)
  // have no body in this file — strip the whole line. GAS's flat global
  // scope makes the symbols visible directly.
  body = body.replace(/^export\s+\*\s+from\s+["'][^"']+["'];?\s*$/gm, "");
  body = body.replace(
    /^export\s+\{[^}]*\}\s+from\s+["'][^"']+["'];?\s*$/gm,
    ""
  );
  body = body.replace(/^export\s+default\s+/gm, "");
  body = body.replace(/^export\s+\{\s*\};?\s*$/gm, "");
  body = body.replace(/^export\s+/gm, "");
  body = body.replace(/^import\b[^\n]*\n/gm, "");
  return body;
}

// True when the stripped body has no runtime code — only comments and
// whitespace. Type-only files (types.ts, index.ts barrels) hit this.
function isCommentOnly(body: string): boolean {
  const withoutBlocks = body.replace(/\/\*[\s\S]*?\*\//g, "");
  const withoutLines = withoutBlocks.replace(/^\s*\/\/[^\n]*$/gm, "");
  return withoutLines.trim() === "";
}

// GAS evaluates files in name order and `const` has TDZ across files,
// so prefix by layer to enforce dependency order: engine → rules →
// rulesets → scheduler → sheet. (Combinators are function declarations
// and get hoisted across the flat global scope regardless, but the
// ruleset compositions are top-level `const`s and need the ordering.)
function layerPrefix(relPath: string): string {
  if (relPath === "engine.js") return "10";
  if (relPath === "rules.js") return "20";
  if (relPath === "rulesets.js") return "30";
  if (relPath === "scheduler.js") return "40";
  if (relPath === "sheet.js") return "50";
  return "99";
}

const written = new Map<string, string>();
const wrote: string[] = [];

for (const jsPath of walk(buildDir)) {
  const relPath = path.relative(buildDir, jsPath);
  const basename = path.basename(jsPath);
  const body = stripModuleSyntax(fs.readFileSync(jsPath, "utf8")).trim();
  if (!body || isCommentOnly(body)) continue;

  const outName = `${layerPrefix(relPath)}_${basename}`;

  if (written.has(outName)) {
    throw new Error(
      `dist/ basename collision: both ${written.get(outName)} and ${relPath} would emit to dist/${outName}`
    );
  }
  written.set(outName, relPath);

  const srcRel = "src/" + relPath.replace(/\.js$/, ".ts");
  fs.writeFileSync(
    path.join(distDir, outName),
    HEADER(srcRel) + body + "\n"
  );
  wrote.push(outName);
}

fs.copyFileSync(
  path.join(repoRoot, "appsscript.json"),
  path.join(distDir, "appsscript.json")
);

console.log(
  `Wrote:\n${wrote
    .sort()
    .map((n) => `  dist/${n}`)
    .join("\n")}\n  dist/appsscript.json`
);
