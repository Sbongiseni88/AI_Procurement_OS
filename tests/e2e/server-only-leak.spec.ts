import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

/**
 * The `server-only` guard (ARCHITECTURE.md §7) is what keeps the RLS-bypassing secret
 * key out of the browser bundle. This test proves it still works: it adds a Client
 * Component that imports `admin.ts`, runs a production build, and expects the build
 * to FAIL.
 *
 * The build runs in a throwaway copy (`.leak-probe/`, git-ignored) rather than in
 * `src/app`: a probe page in the real tree is picked up by the running dev server and
 * by `.next/types`, whose generated route types would keep pointing at it after it is
 * deleted and break `npm run typecheck`. The copy is removed in `finally` and again in
 * `beforeAll`/`afterAll`, so nothing is left behind even when the test fails.
 */
const ROOT = process.cwd();
const PROBE_ROOT = path.join(ROOT, ".leak-probe");
const COPIED = ["src", "tsconfig.json", "next.config.ts", "postcss.config.mjs", "package.json"];

function removeProbe(): void {
  rmSync(PROBE_ROOT, { recursive: true, force: true });
}

function createProbeProject(): void {
  mkdirSync(PROBE_ROOT, { recursive: true });
  for (const entry of COPIED) {
    cpSync(path.join(ROOT, entry), path.join(PROBE_ROOT, entry), { recursive: true });
  }
  // Inside the repo, so Turbopack's project root (the lockfile's directory) still
  // contains the real node_modules this symlink resolves to.
  symlinkSync(path.join(ROOT, "node_modules"), path.join(PROBE_ROOT, "node_modules"), "dir");

  const probeDir = path.join(PROBE_ROOT, "src", "app", "server-only-leak-probe");
  mkdirSync(probeDir, { recursive: true });
  writeFileSync(
    path.join(probeDir, "page.tsx"),
    [
      '"use client";',
      "",
      'import { createSupabaseAdminClient } from "@/lib/supabase/admin";',
      "",
      "export default function Probe() {",
      "  return <p>{typeof createSupabaseAdminClient}</p>;",
      "}",
      "",
    ].join("\n"),
  );
}

test.describe("server-only guard", () => {
  test.describe.configure({ mode: "serial", timeout: 300_000 });

  test.beforeAll(() => {
    // A previous run killed mid-build could have left a probe behind.
    removeProbe();
  });

  test.afterAll(() => {
    removeProbe();
  });

  test("importing admin.ts from a Client Component fails the build", () => {
    try {
      createProbeProject();

      // Run Next's CLI directly rather than through `npx`, so the timeout kills the build
      // itself and not just a wrapper that would leave it running after cleanup.
      const nextCli = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
      const build = spawnSync(process.execPath, [nextCli, "build"], {
        cwd: PROBE_ROOT,
        killSignal: "SIGKILL",
        encoding: "utf8",
        timeout: 240_000,
        env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
      });
      // Strip ANSI colour codes: Playwright sets FORCE_COLOR for child processes.
      const output = `${build.stdout}\n${build.stderr}`.replace(/\u001b\[[0-9;]*m/g, "");

      expect(build.status, "build should fail when admin.ts reaches the client").not.toBe(0);
      // Next's wording varies between runs, so assert on what identifies this guard:
      // the `server-only` import, traced from the probe into the browser bundle.
      // That way an unrelated build error cannot make this test pass.
      expect(output).toContain('import "server-only"');
      expect(output).toContain("[Client Component Browser]");
      expect(output).toContain("server-only-leak-probe/page.tsx");
    } finally {
      removeProbe();
    }
    expect(existsSync(PROBE_ROOT)).toBe(false);
  });
});
