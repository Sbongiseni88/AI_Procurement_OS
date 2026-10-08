export function AuthHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
      {description && <p className="text-sm text-ink-muted">{description}</p>}
    </div>
  );
}
