"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  adminCookie,
  createAdminSession,
  verifyAdminCredentials,
} from "../../lib/admin-session";
import { requireAdminCapability } from "../../lib/admin-operator";
import {
  addAlias,
  createAdminUser,
  createPlayer,
  deleteAdminUser,
  removeAlias,
  resetAdminUserPassword,
  updatePlayer,
  updatePlayerStatus,
  updateReview,
} from "../../lib/admin-api";

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
  await requireAdminCapability("content");

  const snapshotId = String(formData.get("snapshotId") ?? "");
  const reviewStatus = String(formData.get("reviewStatus") ?? "");
  if (
    !snapshotId ||
    (reviewStatus !== "approved" && reviewStatus !== "rejected")
  )
    throw new Error("Invalid review request");
  await updateReview(snapshotId, reviewStatus);
  redirect(String(formData.get("returnTo") ?? "/admin"));
}

function list(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function rolesFromForm(formData: FormData) {
  const values = formData
    .getAll("roles")
    .map(String)
    .filter((value) =>
      ["duelist", "initiator", "controller", "sentinel", "flex"].includes(
        value,
      ),
    );
  const fallback = String(formData.get("primaryRole") ?? "flex");
  const roles = [...new Set(values.length ? values : [fallback])];
  return {
    roles: roles as (
      "duelist" | "initiator" | "controller" | "sentinel" | "flex"
    )[],
    primaryRole: roles[0] as
      "duelist" | "initiator" | "controller" | "sentinel" | "flex",
  };
}

export async function createPlayerAction(formData: FormData): Promise<void> {
  await requireAdminCapability("content");
  const rosterStatus = String(formData.get("rosterStatus") ?? "active") as
    "active" | "benched" | "transferred" | "retired" | "inactive";
  const roleData = rolesFromForm(formData);
  await createPlayer({
    canonicalName: String(formData.get("canonicalName") ?? ""),
    aliases: list(formData.get("aliases")),
    countryCode: String(formData.get("countryCode") ?? "").toUpperCase(),
    countryGroup: String(formData.get("countryGroup") ?? ""),
    age: Number(formData.get("age")),
    region: String(formData.get("region")) as
      "americas" | "emea" | "pacific" | "china",
    ...roleData,
    currentOrLastTeam: String(formData.get("team") ?? ""),
    rosterStatus,
    championsTitles: Number(formData.get("championsTitles")),
    mastersTitles: Number(formData.get("mastersTitles")),
    leagueTitles: Number(formData.get("leagueTitles")),
    isActiveRoster: rosterStatus === "active" || rosterStatus === "benched",
    dataAsOf: String(formData.get("dataAsOf") ?? ""),
    sourceUrl: String(formData.get("sourceUrl") ?? ""),
    sourceCheckedAt: new Date().toISOString(),
    reviewStatus: "pending_review",
  });
  redirect(String(formData.get("returnTo") ?? "/admin?created=1"));
}

export async function updatePlayerAction(formData: FormData): Promise<void> {
  await requireAdminCapability("content");
  const playerId = String(formData.get("playerId") ?? "");
  if (!playerId) throw new Error("Player id is required");
  const rosterStatus = String(formData.get("rosterStatus") ?? "active") as
    "active" | "benched" | "transferred" | "retired" | "inactive";
  const roleData = rolesFromForm(formData);
  await updatePlayer(playerId, {
    isCoach: formData.get("isCoach") === "true",
    isFeaturedTeam: formData.get("isFeaturedTeam") === "true",
    isVctCnTeam: formData.get("isVctCnTeam") === "true",
    canonicalName: String(formData.get("canonicalName") ?? ""),
    aliases: list(formData.get("aliases")),
    countryCode: String(formData.get("countryCode") ?? "").toUpperCase(),
    countryGroup: String(formData.get("countryGroup") ?? ""),
    age: Number(formData.get("age")),
    region: String(formData.get("region")) as
      "americas" | "emea" | "pacific" | "china",
    ...roleData,
    currentOrLastTeam: String(formData.get("team") ?? ""),
    rosterStatus,
    championsTitles: Number(formData.get("championsTitles")),
    mastersTitles: Number(formData.get("mastersTitles")),
    leagueTitles: Number(formData.get("leagueTitles")),
    isActiveRoster: rosterStatus === "active" || rosterStatus === "benched",
    dataAsOf: String(formData.get("dataAsOf") ?? ""),
    sourceUrl: String(formData.get("sourceUrl") ?? ""),
    sourceCheckedAt: new Date().toISOString(),
    reviewStatus: "pending_review",
  });
  redirect(`/admin/players/${playerId}?updated=1`);
}

export async function setPlayerStatus(formData: FormData): Promise<void> {
  await requireAdminCapability("content");
  await updatePlayerStatus(
    String(formData.get("playerId") ?? ""),
    String(formData.get("status")) as "active" | "disabled",
  );
  redirect(String(formData.get("returnTo") ?? "/admin"));
}

export async function addAliasAction(formData: FormData): Promise<void> {
  await requireAdminCapability("content");
  const playerId = String(formData.get("playerId") ?? "");
  await addAlias(playerId, String(formData.get("alias") ?? ""));
  redirect(`/admin/players/${playerId}`);
}

export async function removeAliasAction(formData: FormData): Promise<void> {
  await requireAdminCapability("content");
  const playerId = String(formData.get("playerId") ?? "");
  await removeAlias(playerId, String(formData.get("aliasId") ?? ""));
  redirect(`/admin/players/${playerId}`);
}

export async function createUserAction(formData: FormData): Promise<void> {
  await requireAdminCapability("content");
  await createAdminUser({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    displayName: String(formData.get("displayName") ?? "").trim() || undefined,
    role: String(formData.get("role") ?? "user") as "user" | "admin",
  });
  redirect("/admin?section=users&createdUser=1");
}

export async function resetUserPasswordAction(
  formData: FormData,
): Promise<void> {
  await requireAdminCapability("content");
  const userId = String(formData.get("userId") ?? "");
  if (!userId) throw new Error("User id is required");
  await resetAdminUserPassword(userId);
  redirect("/admin?section=users&resetUser=1");
}

export async function deleteUserAction(formData: FormData): Promise<void> {
  await requireAdminCapability("content");
  const userId = String(formData.get("userId") ?? "");
  if (!userId) throw new Error("User id is required");
  let failed = false;
  try {
    await deleteAdminUser(userId);
  } catch {
    failed = true;
  }
  const view = String(formData.get("userView") ?? "active");
  redirect(
    `/admin?section=users&userView=${encodeURIComponent(view)}&${failed ? "userError=1" : "deletedUser=1"}`,
  );
}
