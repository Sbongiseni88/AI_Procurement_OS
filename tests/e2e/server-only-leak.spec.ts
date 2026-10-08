import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

/**
 * The `server-only` guard (ARCHITECTURE.md §7) is what keeps the RLS-bypassing secret
 * key out of the browser bundle. This test proves it still works: it adds a Client
 * Component that imports `admin.ts`, runs a production build, and expects the build
 * to FAIL. The probe is removed in `finally` and again in `afterAll`, so the tree is
 * restored even when the build hangs or the assertion fails.
 *
 * It does not touch the dev server: `next dev` compiles routes on demand and writes to
 * `.next/dev`, while `next build` writes to `.next` (Next 16 runs them side by side).
 */
const PROBE_DIR = path.join(process.cwd(), "src", "app", "server-only-leak-probe");

function removeProbe(): void {
  rmSync(PROBE_DIR, { recursive: true, force: true });
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
    mkdirSync(PROBE_DIR, { recursive: true });
    try {
      writeFileSync(
        path.join(PROBE_DIR, "page.tsx"),
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

      const build = spawnSync("npx", ["next", "build"], {
        cwd: process.cwd(),
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
    expect(existsSync(PROBE_DIR)).toBe(false);
  });
});
