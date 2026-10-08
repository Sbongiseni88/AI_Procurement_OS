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
          ? "border-danger/30 bg-danger-soft text-danger rounded-md border px-3 py-2 text-sm"
          : "border-line bg-surface-muted text-ink rounded-md border px-3 py-2 text-sm"
      }
    >
      {children}
    </p>
  );
}
