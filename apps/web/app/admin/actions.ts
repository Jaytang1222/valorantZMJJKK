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
  createPlayer,
  removeAlias,
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
  redirect("/admin");
}

function list(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function createPlayerAction(formData: FormData): Promise<void> {
  await requireAdminCapability("content");
  const heroes = list(formData.get("heroTop3"));
  if (heroes.length !== 3)
    throw new Error("Hero Top 3 must contain exactly three heroes");
  await createPlayer({
    canonicalName: String(formData.get("canonicalName") ?? ""),
    aliases: list(formData.get("aliases")),
    countryCode: String(formData.get("countryCode") ?? "").toUpperCase(),
    countryGroup: String(formData.get("countryGroup") ?? ""),
    region: String(formData.get("region")) as
      "americas" | "emea" | "pacific" | "china",
    primaryRole: String(formData.get("primaryRole")) as
      "duelist" | "initiator" | "controller" | "sentinel" | "flex",
    currentOrLastTeam: String(formData.get("team") ?? ""),
    championsTitles: Number(formData.get("championsTitles")),
    mastersTitles: Number(formData.get("mastersTitles")),
    heroTop3: heroes as [string, string, string],
    dataAsOf: String(formData.get("dataAsOf") ?? ""),
    sourceUrl: String(formData.get("sourceUrl") ?? ""),
    sourceCheckedAt: new Date().toISOString(),
    reviewStatus: "approved",
  });
  redirect("/admin?created=1");
}

export async function setPlayerStatus(formData: FormData): Promise<void> {
  await requireAdminCapability("content");
  await updatePlayerStatus(
    String(formData.get("playerId") ?? ""),
    String(formData.get("status")) as "active" | "disabled",
  );
  redirect("/admin");
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
