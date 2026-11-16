import { Dashboard } from "@/components/dashboard";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
export default async function Page() {
  const user = await getSession();
  if (!user) redirect("/login");
  return <Dashboard user={user} />;
}
