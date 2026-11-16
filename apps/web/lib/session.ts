import { cookies } from "next/headers";
export async function getSession() {
  const token = (await cookies()).get("markup_session")?.value;
  if (!token) return null;
  try {
    const response = await fetch(
      `${process.env.API_INTERNAL_URL || "http://127.0.0.1:8000"}/auth/me`,
      {
        headers: { cookie: `markup_session=${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) return null;
    return (await response.json()) as {
      email: string;
      role: import("@/components/has-permission").Role;
      tenant_id: string;
    };
  } catch {
    return null;
  }
}
