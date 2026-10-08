/**
 * Placeholder for the tender upload action (E3.2). Shown disabled with a plain
 * explanation rather than hidden, so the board reads as it will once upload opens.
 */
export function UploadTenderButton({ noteId }: { noteId: string }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled
        aria-describedby={noteId}
        className="h-10 cursor-not-allowed rounded-md bg-accent px-4 text-sm font-medium text-accent-ink opacity-50"
      >
        Upload a tender
      </button>
      <p id={noteId} className="text-xs text-ink-muted">
        Tender upload opens after company documents, in a later release.
      </p>
    </div>
  );
}
