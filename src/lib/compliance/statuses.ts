/**
 * The Phase 1 status set (ARCHITECTURE.md §6). The expiry engine (E2.5) and the
 * matching engine (E4.1) return these values; `StatusPill` renders them. Pure data,
 * no UI imports, so the engines can use it.
 */
export const COMPLIANCE_STATUSES = [
  "compliant",
  "expiring",
  "expired",
  "missing",
  "conflict",
  "needs-verification",
  "unable-to-verify",
] as const;

export type ComplianceStatus = (typeof COMPLIANCE_STATUSES)[number];

export const STATUS_LABELS: Record<ComplianceStatus, string> = {
  compliant: "Compliant",
  expiring: "Expiring soon",
  expired: "Expired",
  missing: "Missing",
  conflict: "Conflict",
  "needs-verification": "Needs verification",
  "unable-to-verify": "Unable to verify",
};

/** What a person has to do about each status; used for legends and gap reports. */
export const STATUS_MEANINGS: Record<ComplianceStatus, string> = {
  compliant: "Meets the requirement. Nothing to do.",
  expiring: "Valid now, but expires before long. Renew it soon.",
  expired: "Past its expiry date, or certified too long ago. Replace it before submitting.",
  missing: "No document for this requirement yet. Upload one.",
  conflict: "Two documents disagree, for example on the address. Fix one of them.",
  "needs-verification": "Read by AI but not yet confirmed. A person must check it.",
  "unable-to-verify": "The document could not be read clearly. A person must check it.",
};
