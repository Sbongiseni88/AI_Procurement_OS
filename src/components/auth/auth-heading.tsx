export function AuthHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="text-ink text-xl font-semibold tracking-tight">{title}</h1>
      {description && <p className="text-ink-muted text-sm">{description}</p>}
    </div>
  );
}
