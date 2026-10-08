import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Must stay last: switches off every stylistic rule Prettier already owns.
  prettier,
  {
    rules: {
      // CLAUDE.md §1.3: strict TypeScript, no `any`, no unsafe casts.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Architecture rule 6: AI only through the gateway. Provider SDKs are imported in
    // exactly one adapter each, under src/lib/ai/providers/.
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@anthropic-ai/sdk", "@anthropic-ai/sdk/*"],
              message:
                "Call AI through the gateway (src/lib/ai). Only src/lib/ai/providers/anthropic.ts imports the Anthropic SDK.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/lib/ai/providers/anthropic.ts"],
    rules: { "no-restricted-imports": "off" },
  },
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Throwaway build copy made by the server-only leak probe test.
    ".leak-probe/**",
  ]),
]);

export default eslintConfig;
