// Builds the Apps Script deploy directory at dist/. The contents:
//
//   dist/scheduler.js   — generated from src/scheduler.ts (the algorithm)
//   dist/sheet.js       — generated from src/sheet.ts (the sheet wrapper)
//   dist/appsscript.json— copied from ./appsscript.json (the manifest)
//
// dist/ is what clasp pushes (rootDir in .clasp.json). After build,
// `clasp push` deploys to the bound script.
//
// We can't use tsc's `outFile` to produce a single bundle directly,
// because outFile requires module: "none" | "amd" | "system" — none
// of which let us also use `import`/`export` statements that the test
// runner and bin scripts need. So tsc emits to ./build/ and this
// script strips module syntax + writes per-file outputs.

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

// One entry per file to emit into dist/. Order doesn't matter for GAS
// — files share a global scope and are evaluated together.
const emit: { srcName: string; outName: string }[] = [
  { srcName: "scheduler.js", outName: "scheduler.js" },
  { srcName: "sheet.js", outName: "sheet.js" },
];

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

for (const { srcName, outName } of emit) {
  const p = path.join(buildDir, srcName);
  if (!fs.existsSync(p)) continue;
  let body = fs.readFileSync(p, "utf8");
  // Strip ES module syntax — GAS has no equivalent.
  body = body.replace(/^export\s+default\s+/gm, "");
  body = body.replace(/^export\s+/gm, "");
  body = body.replace(/^import\b[^\n]*\n/gm, "");
  fs.writeFileSync(
    path.join(distDir, outName),
    HEADER(`src/${srcName.replace(/\.js$/, ".ts")}`) + body
  );
}

fs.copyFileSync(
  path.join(repoRoot, "appsscript.json"),
  path.join(distDir, "appsscript.json")
);

const wrote = fs
  .readdirSync(distDir)
  .map((n) => `  ${path.relative(repoRoot, path.join(distDir, n))}`)
  .join("\n");
console.log(`Wrote:\n${wrote}`);
