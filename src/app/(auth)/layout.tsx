/**
 * Shell for the signed-out pages: the product name and one narrow, left-aligned
 * column. No marketing copy; this is the door to a working tool.
 */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col px-4 py-10 sm:px-6 sm:py-16">
      <div className="mx-auto flex w-full max-w-sm flex-col gap-8">
        <p className="text-ink text-sm font-semibold tracking-tight">AI Procurement OS</p>
        <main className="flex flex-col gap-6">{children}</main>
      </div>
    </div>
  );
}
