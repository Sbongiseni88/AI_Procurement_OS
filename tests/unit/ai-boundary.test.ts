import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ESLint } from "eslint";

/**
 * Architecture rule 6: only the gateway's Anthropic adapter may import the Anthropic
 * SDK. This runs the project's own ESLint config on a two-line probe placed at
 * different paths, so the rule cannot be dropped or widened unnoticed.
 */
const probe = 'import Anthropic from "@anthropic-ai/sdk";\nexport const client = Anthropic;\n';
const subpathProbe =
  'import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";\nexport const f = betaZodOutputFormat;\n';

async function restricted(code: string, filePath: string): Promise<boolean> {
  const [result] = await new ESLint().lintText(code, { filePath });
  return (result?.messages ?? []).some((m) => m.ruleId === "no-restricted-imports");
}

describe("AI provider SDK boundary", () => {
  it("refuses the Anthropic SDK anywhere outside the adapter", async () => {
    for (const path of [
      "src/lib/tenders/reader.ts",
      "src/lib/ai/gateway.ts",
      "src/app/(app)/page.tsx",
      "scripts/verify-rls.ts",
    ]) {
      assert.ok(await restricted(probe, path), path);
    }
    assert.ok(await restricted(subpathProbe, "src/lib/jobs/handlers.ts"));
  });

  it("allows it in the Anthropic adapter only", async () => {
    assert.equal(await restricted(probe, "src/lib/ai/providers/anthropic.ts"), false);
    assert.equal(await restricted(subpathProbe, "src/lib/ai/providers/anthropic.ts"), false);
  });
});
