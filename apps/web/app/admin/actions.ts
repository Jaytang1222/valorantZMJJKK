"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  adminCookie,
  createAdminSession,
  isValidAdminSession,
  verifyAdminCredentials,
} from "../../lib/admin-session";
import { updateReview } from "../../lib/admin-api";

export async function login(formData: FormData): Promise<void> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!verifyAdminCredentials(username, password))
    redirect("/admin?error=invalid_credentials");

  const store = await cookies();
  store.set(
    adminCookie.name,
    createAdminSession(username),
    adminCookie.options,
  );
  redirect("/admin");
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(adminCookie.name);
  redirect("/admin");
}

export async function review(formData: FormData): Promise<void> {
  const store = await cookies();
  if (!isValidAdminSession(store.get(adminCookie.name)?.value))
    redirect("/admin");

  const snapshotId = String(formData.get("snapshotId") ?? "");
  const reviewStatus = String(formData.get("reviewStatus") ?? "");
  if (
    !snapshotId ||
    (reviewStatus !== "approved" && reviewStatus !== "rejected")
  )
    throw new Error("Invalid review request");
  await updateReview(snapshotId, reviewStatus);
  redirect("/admin");
}
