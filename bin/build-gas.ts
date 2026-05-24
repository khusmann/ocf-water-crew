// Compiles src/ via tsc, concatenates the emitted JS files (in
// dependency order), strips ES-module syntax, prepends a "generated"
// header, and writes the single-file result to dist/Code.gs.
//
// We can't use tsc's `outFile` for this because outFile requires
// module: "none" | "amd" | "system" — none of which let us also use
// `import`/`export` statements that the test runner and bin scripts
// need. So we emit to ./build/ then assemble here.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const buildDir = path.join(repoRoot, "build");
const distDir = path.join(repoRoot, "dist");
const outFile = path.join(distDir, "Code.gs");

// The order matters only insofar as helper functions must be defined
// before assign(). Since types.ts emits nothing at runtime, scheduler.js
// is the only real input today.
const fileOrder = ["scheduler.js"];

const HEADER = `// Generated from src/scheduler.ts by bin/build-gas.ts — do not edit.
// To regenerate: npm run build
`;

fs.rmSync(buildDir, { recursive: true, force: true });

const tsc = spawnSync(
  "npx",
  ["tsc", "-p", path.join(repoRoot, "tsconfig.json")],
  { cwd: repoRoot, stdio: "inherit" }
);
if (tsc.status !== 0) {
  process.exit(tsc.status ?? 1);
}

const parts: string[] = [HEADER];

for (const name of fileOrder) {
  const p = path.join(buildDir, name);
  if (!fs.existsSync(p)) continue;
  let body = fs.readFileSync(p, "utf8");
  // Strip ES module syntax — no GAS equivalent.
  body = body.replace(/^export\s+default\s+/gm, "");
  body = body.replace(/^export\s+/gm, "");
  body = body.replace(/^import\b[^\n]*\n/gm, "");
  parts.push(body);
}

fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(outFile, parts.join("\n"));

console.log(`Wrote ${path.relative(repoRoot, outFile)}`);
