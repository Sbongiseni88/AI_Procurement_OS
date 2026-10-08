import { logOut } from "@/lib/auth/actions";
import { requireMembership, ROLE_LABELS } from "@/lib/workspace/membership";

/*
 * Signed-in placeholder until E1.7/E1.8 replace it with the app shell and dashboard.
 */
export default async function Home() {
  const { organization, fullName, email, role } = await requireMembership();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-balance break-words">
        {organization.name}
      </h1>
      <p className="text-sm break-words text-ink-muted">
        Signed in as <span className="font-medium text-ink">{fullName || email}</span> ({email}) ·{" "}
        {ROLE_LABELS[role]}
      </p>
      <form action={logOut}>
        <button
          type="submit"
          className="h-9 rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Log out
        </button>
      </form>
    </main>
  );
}
