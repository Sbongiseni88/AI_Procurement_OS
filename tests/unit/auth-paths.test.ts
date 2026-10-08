import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isGuestOnlyPath, isPublicPath, safeNextPath } from "../../src/lib/auth/paths.ts";

describe("safeNextPath", () => {
  it("keeps a same-site path with its query", () => {
    assert.equal(safeNextPath("/tenders?stage=reading"), "/tenders?stage=reading");
  });

  it("falls back to / for missing or absolute values", () => {
    for (const value of [null, undefined, "", "tenders", "https://evil.example/"]) {
      assert.equal(safeNextPath(value), "/", String(value));
    }
  });

  it("refuses protocol-relative paths a browser would treat as another site", () => {
    assert.equal(safeNextPath("//evil.example/steal"), "/");
    assert.equal(safeNextPath("/\\evil.example"), "/");
  });

  it("refuses paths hiding a second slash behind characters URL parsing drops", () => {
    for (const value of ["/\t/evil.example", "/\n/evil.example", "/\r//evil.example"]) {
      assert.equal(safeNextPath(value), "/", JSON.stringify(value));
    }
    // `?next=/%09/evil.example` arrives here already decoded to a tab.
    assert.equal(safeNextPath(decodeURIComponent("/%09/evil.example")), "/");
  });

  it("never sends a signed-in user back to a guest page", () => {
    assert.equal(safeNextPath("/login"), "/");
    assert.equal(safeNextPath("/signup?x=1"), "/");
  });
});

describe("route access", () => {
  it("lets signed-out visitors reach only the auth pages and the email-link route", () => {
    assert.ok(isPublicPath("/login"));
    assert.ok(isPublicPath("/auth/callback"));
    assert.ok(!isPublicPath("/"));
    assert.ok(!isPublicPath("/reset-password"));
  });

  it("treats the reset-password page as signed-in only", () => {
    assert.ok(!isGuestOnlyPath("/reset-password"));
    assert.ok(isGuestOnlyPath("/forgot-password"));
  });
});
