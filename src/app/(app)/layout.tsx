import { AppShell } from "@/components/shell/app-shell";
import { requireMembership } from "@/lib/workspace/membership";

/** Every page inside the workspace: signed in, onboarded, inside the app shell. */
export default async function WorkspaceLayout({ children }: LayoutProps<"/">) {
  const membership = await requireMembership();
  return <AppShell membership={membership}>{children}</AppShell>;
}
