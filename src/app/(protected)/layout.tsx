import { redirect } from "next/navigation";
import { getSession } from "@/server/require-session";
import { AppShell } from "@/components/app-shell";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return <AppShell adminEmail={session.sub}>{children}</AppShell>;
}
