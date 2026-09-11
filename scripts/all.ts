/**
 * Workspace task runner.
 *
 * Runs a task for the root package *and* every workspace package that defines
 * it, so that a single command at the repo root covers the whole monorepo:
 *
 *   bun run dev    -> root dev   + packages/* dev
 *   bun run build  -> root build + packages/* build
 *   bun run start  -> root start + packages/* start
 *
 * The root's own implementation lives under `<task>:root` to avoid recursion.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

interface PackageJson {
  name?: string;
  workspaces?: string[];
  scripts?: Record<string, string>;
}

interface Job {
  name: string;
  cwd: string;
  script: string;
}

const task = process.argv[2];
if (!task) {
  console.error("Usage: bun run scripts/all.ts <dev|build|start>");
  process.exit(1);
}

const rootDir = path.resolve(import.meta.dir, "..");
const bunBin = process.execPath;

function readPackage(dir: string): PackageJson {
  return JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as PackageJson;
}

const rootPkg = readPackage(rootDir);
const jobs: Job[] = [];

// 1. The root package's own task (namespaced to avoid recursion).
const rootScript = `${task}:root`;
if (rootPkg.scripts?.[rootScript]) {
  jobs.push({ name: `${rootPkg.name ?? "root"} (root)`, cwd: rootDir, script: rootScript });
} else {
  console.warn(`[all] Root has no "${rootScript}" script – skipping root.`);
}

// 2. Every workspace package that defines the task.
const workspaceDirs = new Set<string>();
for (const pattern of rootPkg.workspaces ?? []) {
  const glob = new Bun.Glob(`${pattern.replace(/\\/g, "/")}/package.json`);
  for (const match of glob.scanSync({ cwd: rootDir, onlyFiles: true })) {
    workspaceDirs.add(path.dirname(match));
  }
}

for (const relativeDir of workspaceDirs) {
  const dir = path.join(rootDir, relativeDir);
  if (!existsSync(path.join(dir, "package.json"))) continue;

  const pkg = readPackage(dir);
  if (!pkg.scripts?.[task]) continue;

  jobs.push({ name: pkg.name ?? relativeDir, cwd: dir, script: task });
}

if (jobs.length === 0) {
  console.error(`[all] No jobs found for task "${task}".`);
  process.exit(1);
}

console.log(`[all] ${task} → ${jobs.map((job) => job.name).join(", ")}`);

if (process.env.ALL_DRY === "1") {
  for (const job of jobs) {
    console.log(`  - ${job.name}: ${job.script} (${job.cwd})`);
  }
  process.exit(0);
}

const children = jobs.map((job) =>
  Bun.spawn([bunBin, "run", job.script], {
    cwd: job.cwd,
    stdio: ["inherit", "inherit", "inherit"],
    env: { ...process.env },
  }),
);

let shuttingDown = false;
function shutdown(code: number) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    try {
      child.kill();
    } catch {
      // process already gone
    }
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));

const results = await Promise.all(
  children.map(async (child, index) => ({
    name: jobs[index]?.name ?? `job-${index}`,
    code: await child.exited,
  })),
);

const failed = results.filter((result) => result.code !== 0);
if (failed.length > 0) {
  for (const result of failed) {
    console.error(`[all] "${result.name}" exited with code ${result.code}.`);
  }
  process.exit(1);
}
