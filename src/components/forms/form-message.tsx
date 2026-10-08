/**
 * The form-level outcome line. `role="alert"` for errors and `status` for
 * confirmations, so assistive tech announces the result of a submit.
 */
export function FormMessage({ tone, children }: { tone: "error" | "info"; children: string }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={
        tone === "error"
          ? "rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger"
          : "rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-ink"
      }
    >
      {children}
    </p>
  );
}
