/**
 * The one permission matrix (Architecture rule 3): which role may do what, for every
 * module. Server actions and server helpers ask `can(role, action)` (usually through
 * `requirePermission` in `src/lib/workspace/membership.ts`) before they write; screens
 * may use it to hide what a person cannot do. RLS still enforces tenancy and the
 * sensitive writes in the database, so a bug here cannot cross companies.
 *
 * Pure data and functions, no imports, so unit tests and client code can use it.
 *
 * Adding a role (e.g. one of the booklet's): add the value to the `app_role` enum in a
 * migration, add it to APP_ROLES and ROLE_LABELS, give it a row in MATRIX, and update
 * any policy that lists roles (see ARCHITECTURE.md §8, Permissions). Adding an action:
 * add it to ACTIONS and to the rows of the roles that may do it.
 */

/** Must match the `app_role` enum; `membership.ts` fails to compile if they drift. */
export const APP_ROLES = [
  "executive_approver",
  "bid_manager",
  "pricing_specialist",
  "viewer",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const ROLE_LABELS: Record<AppRole, string> = {
  executive_approver: "Executive approver",
  bid_manager: "Bid manager",
  pricing_specialist: "Pricing specialist",
  viewer: "Viewer",
};

export const ACTIONS = [
  /** Upload company or tender documents and new versions of them. */
  "documents.upload",
  /** Confirm, correct or reject facts read from company documents. */
  "documents.review",
  /** Add a tender, RFQ, RFP or quotation request. */
  "tenders.create",
  /** Confirm or correct a tender's facts, requirements and stated rules. */
  "tenders.review",
  /** Record a decision on a requirement's result (confirm, override, not applicable). */
  "requirements.decide",
  /** Invite people, change their roles, remove them. */
  "members.manage",
  /** Edit company details and company settings. */
  "settings.edit",
  /** Read the company's audit log. */
  "audit.view",
] as const;

export type Action = (typeof ACTIONS)[number];

const MATRIX: Record<AppRole, ReadonlySet<Action>> = {
  executive_approver: new Set(ACTIONS),
  bid_manager: new Set([
    "documents.upload",
    "documents.review",
    "tenders.create",
    "tenders.review",
    "requirements.decide",
    "settings.edit",
    "audit.view",
  ]),
  pricing_specialist: new Set(["documents.upload", "audit.view"]),
  viewer: new Set(["audit.view"]),
};

/** Whether a person with this role may perform this action. */
export function can(role: AppRole, action: Action): boolean {
  return MATRIX[role].has(action);
}

/** The roles allowed to perform an action, in APP_ROLES order. */
export function rolesThatCan(action: Action): AppRole[] {
  return APP_ROLES.filter((role) => can(role, action));
}
