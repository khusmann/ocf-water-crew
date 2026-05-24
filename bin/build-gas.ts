// Builds the Apps Script deploy directory at dist/. The contents:
//
//   dist/Scheduler.js   — generated from src/scheduler.ts (the algorithm)
//   dist/Code.js        — copied from src/Code.js (the sheet wrapper)
//   dist/appsscript.json— copied from ./appsscript.json (the manifest)
//
// dist/ is what clasp pushes (rootDir in .clasp.json). After build,
// `clasp push` deploys to the bound script.
//
// We can't use tsc's `outFile` to produce Scheduler.js directly,
// because outFile requires module: "none" | "amd" | "system" — none
// of which let us also use `import`/`export` statements that the test
// runner and bin scripts need. So tsc emits to ./build/ and this
// script strips module syntax + concatenates.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const buildDir = path.join(repoRoot, "build");
const distDir = path.join(repoRoot, "dist");
const srcDir = path.join(repoRoot, "src");

const HEADER = `// Generated from src/scheduler.ts by bin/build-gas.ts — do not edit.
// To regenerate: npm run build
`;

// The order matters only insofar as helper functions must be defined
// before assign(). Since types.ts emits nothing at runtime, scheduler.js
// is the only real input today.
const scriptParts = ["scheduler.js"];

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

const pieces: string[] = [HEADER];
for (const name of scriptParts) {
  const p = path.join(buildDir, name);
  if (!fs.existsSync(p)) continue;
  let body = fs.readFileSync(p, "utf8");
  // Strip ES module syntax — GAS has no equivalent.
  body = body.replace(/^export\s+default\s+/gm, "");
  body = body.replace(/^export\s+/gm, "");
  body = body.replace(/^import\b[^\n]*\n/gm, "");
  pieces.push(body);
}
fs.writeFileSync(path.join(distDir, "Scheduler.js"), pieces.join("\n"));

// Hand-maintained GAS sources, copied verbatim.
fs.copyFileSync(path.join(srcDir, "Code.js"), path.join(distDir, "Code.js"));
fs.copyFileSync(
  path.join(repoRoot, "appsscript.json"),
  path.join(distDir, "appsscript.json")
);

const wrote = fs
  .readdirSync(distDir)
  .map((n) => `  ${path.relative(repoRoot, path.join(distDir, n))}`)
  .join("\n");
console.log(`Wrote:\n${wrote}`);
