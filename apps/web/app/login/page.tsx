import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
export default async function LoginPage() {
  if (await getSession()) redirect("/");
  return <LoginForm />;
}
