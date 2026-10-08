---
name: typescript-best-practices
description: TypeScript rules for this repo (strict mode, Zod at boundaries, Supabase generated types, union types from `as const`, exhaustive handling, dates). Use when writing, reviewing or refactoring any .ts/.tsx file here, adding a schema, a server action, a pure rule function or a test, or when the user asks about types, `any`, casts or TypeScript patterns.
metadata:
  author: AI Procurement OS project
  version: "1.0"
---

# TypeScript best practices (this repo)

The compiler is the first reviewer. Write types that make wrong states impossible to express, and keep them as simple as the code allows. Match the patterns already in `src/lib/`; don't introduce new ones without a reason.

## The compiler settings are the contract

`tsconfig.json` runs `strict`, `noUncheckedIndexedAccess`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUnusedLocals/Parameters` and `useUnknownInCatchVariables`. Never weaken them, never add `// @ts-ignore` or `// @ts-expect-error` to get past an error, never add `skipLibCheck`-style escapes for our own code. Fix the type instead.

## Never

- `any`, explicit or implied. Use `unknown` and narrow.
- `as` on data from outside the process (form input, request bodies, database JSON columns, AI output, `JSON.parse`, env). Parse it with Zod instead. `as const` is fine.
- Non-null `!`. Handle the `undefined`: `noUncheckedIndexedAccess` makes `arr[0]` and `record[key]` possibly undefined on purpose.
- Hand-written database row types. Use `src/lib/supabase/database.types.ts` (regenerate with `npm run db:types` after every migration) and derive from it.
- Type gymnastics: deep conditional or mapped types, overloads, branded types or generic helpers nobody asked for. If a type needs a comment to be understood, simplify it.

## Boundaries: Zod parses, types follow

- Every trust boundary (server action input, route handler body, AI gateway output, env) goes through a Zod schema. Define the schema once and derive the type with `z.infer<typeof Schema>`; never write the type twice.
- Zod 4 API: `z.email()`, `z.url()`, `{ error: "…" }` for messages, `z.prettifyError()` for logs. Error messages are user-facing copy in plain language (see `src/lib/auth/schemas.ts`).
- Use `safeParse` where a failure is an expected outcome (user input); `parse` only where failure is a bug.

## Closed sets: `as const` arrays and derived unions

Statuses, roles, stages and categories are a `const` array plus a derived union, so the runtime list and the type can't drift (see `src/lib/compliance/statuses.ts`, `src/lib/auth/permissions.ts`):

```ts
// src/lib/tenders/stages.ts
export const TENDER_STAGES = ["reading", "review", "checking", "checked"] as const;
export type TenderStage = (typeof TENDER_STAGES)[number];
export const STAGE_DETAILS: Record<TenderStage, { label: string; description: string }> = { … };
```

- `Record<Union, T>` forces every member to be handled; adding a status breaks the build in every place that must change.
- Switches over a union end with an exhaustiveness check:

```ts
default: {
  const unreachable: never = status;
  throw new Error(`Unhandled status: ${String(unreachable)}`);
}
```

- Model results that can be one of several shapes as a discriminated union with a literal `kind`/`ok` field, not optional fields that are "sometimes set".

## Functions and modules

- Plain functions and modules. A class only where the codebase already uses one for a reason (typed errors such as `AiError`). No DI containers, no service classes, no interfaces with a single implementation, except where the architecture requires a seam (the AI provider interface).
- Rule engines (validity, compliance, permissions) are pure functions: data in, result out, no I/O, no `Date.now()` inside. Pass "today" in as an argument so tests can fix it.
- Exported functions get explicit parameter and return types; local code can rely on inference.
- `import type` / inline `type` imports for types (ESLint enforces it). No barrel files.
- Server-only modules start with `import "server-only"`.

## Errors

- `catch (error)` gives `unknown`: narrow with `instanceof` or a Zod schema before reading fields.
- Never swallow an error silently. Return a typed failure the caller must handle, or rethrow with context.
- Errors shown to people say what went wrong and what to do; internal details go to the log, never to the response.

## Dates (this domain lives on them)

- Document dates are calendar dates, not instants: keep them as `YYYY-MM-DD` strings and compare them as dates in `Africa/Johannesburg`. Never compare a date-only value against `new Date()` in UTC; a document dated today can flip to "expired" at 02:00 SAST.
- Timestamps (`created_at`, closing date-time) are ISO strings with an offset from the database; parse once at the edge.
- Format for people with `Intl.DateTimeFormat("en-ZA", …)`, never by hand.

## Tests

- Pure logic gets `node --test` unit tests in `tests/unit/` (imports need explicit `.ts` extensions). Test the edge cases the domain has: empty lists, missing values, the day of expiry, the day after, leap years, a rule absent vs present.
- Tests use synthetic data and the AI gateway's fake provider. Never real client documents.

## Before you finish

`npm run typecheck && npm run lint` must pass with no new suppressions. If you needed a cast or an escape hatch, stop and ask whether the type or the schema is wrong instead.
