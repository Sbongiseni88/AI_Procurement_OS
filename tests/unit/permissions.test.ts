import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ACTIONS,
  APP_ROLES,
  can,
  ROLE_LABELS,
  rolesThatCan,
} from "../../src/lib/auth/permissions.ts";

describe("permission matrix", () => {
  it("lets the executive approver do everything", () => {
    for (const action of ACTIONS) assert.ok(can("executive_approver", action), action);
  });

  it("keeps the viewer read-only", () => {
    const allowed = ACTIONS.filter((action) => can("viewer", action));
    assert.deepEqual(allowed, ["audit.view"]);
  });

  it("lets a bid manager run tenders and documents but not manage people", () => {
    for (const action of [
      "documents.upload",
      "documents.review",
      "tenders.create",
      "tenders.review",
      "requirements.decide",
      "settings.edit",
    ] as const) {
      assert.ok(can("bid_manager", action), action);
    }
    assert.ok(!can("bid_manager", "members.manage"));
  });

  it("lets a pricing specialist upload documents but not confirm facts or decide", () => {
    assert.ok(can("pricing_specialist", "documents.upload"));
    for (const action of [
      "documents.review",
      "tenders.create",
      "tenders.review",
      "requirements.decide",
      "members.manage",
      "settings.edit",
    ] as const) {
      assert.ok(!can("pricing_specialist", action), action);
    }
  });

  it("allows managing people to the executive approver only", () => {
    assert.deepEqual(rolesThatCan("members.manage"), ["executive_approver"]);
  });

  it("matches the roles the database lets edit company details", () => {
    // Policy `organizations_update_own` (T1.3, re-pointed in E1.5.2) lists exactly these
    // roles. If this test fails, change the policy in a migration as well, or the app
    // and the database will disagree about who may edit settings.
    assert.deepEqual(rolesThatCan("settings.edit").toSorted(), [
      "bid_manager",
      "executive_approver",
    ]);
  });

  it("gives every role a label and an answer for every action", () => {
    for (const role of APP_ROLES) {
      assert.ok(ROLE_LABELS[role].length > 0, role);
      for (const action of ACTIONS) assert.equal(typeof can(role, action), "boolean");
    }
  });
});
