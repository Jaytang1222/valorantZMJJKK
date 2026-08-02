import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminCookie, isValidAdminSession } from "./admin-session";
import { unsealUserSession } from "./user-session";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3001";

export type AdminRole = "admin";
export type AdminCapability = "content";
export type AdminOperator = {
  id?: string;
  displayName: string;
  role: AdminRole;
  root: boolean;
};

export async function getAdminOperator(): Promise<AdminOperator | null> {
  const store = await cookies();
  if (isValidAdminSession(store.get(adminCookie.name)?.value)) {
    return { displayName: "根管理员", role: "admin", root: true };
  }
  const token = unsealUserSession(store.get("valo_user_session")?.value);
  if (!token) return null;
  const response = await fetch(`${API_BASE_URL}/v1/auth/me`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const data = (await response.json()) as {
    user?: { id: string; displayName: string; role: string };
  };
  if (!data.user || data.user.role !== "admin") return null;
  return {
    id: data.user.id,
    displayName: data.user.displayName,
    role: "admin",
    root: false,
  };
}

export async function requireAdminCapability(capability: AdminCapability) {
  const operator = await getAdminOperator();
  if (!operator || capability !== "content") redirect("/admin");
  return operator;
}
