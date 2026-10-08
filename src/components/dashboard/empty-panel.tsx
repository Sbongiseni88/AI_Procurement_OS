import Link from "next/link";

/** A dashboard panel with nothing in it yet: what will appear here, and where to go. */
export function EmptyPanel({
  title,
  message,
  link,
}: {
  title: string;
  message: string;
  link?: { href: string; label: string };
}) {
  return (
    <section className="flex flex-col gap-2 rounded-md border border-line bg-surface px-4 py-4">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <p className="text-sm text-ink-muted">{message}</p>
      {link && (
        <Link
          href={link.href}
          className="self-start text-sm text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {link.label}
        </Link>
      )}
    </section>
  );
}
