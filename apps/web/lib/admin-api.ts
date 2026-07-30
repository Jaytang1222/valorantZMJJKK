function getConfig(): { apiBaseUrl: string; internalApiSecret: string } {
  const apiBaseUrl =
    process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;
  const internalApiSecret = process.env.INTERNAL_API_SECRET;
  if (!apiBaseUrl || !internalApiSecret) {
    const missing = [
      !apiBaseUrl && "API_BASE_URL or NEXT_PUBLIC_API_BASE_URL",
      !internalApiSecret && "INTERNAL_API_SECRET",
    ].filter(Boolean);
    throw new Error(
      `Admin API environment variables are missing: ${missing.join(", ")}`,
    );
  }
  return { apiBaseUrl, internalApiSecret };
}

export function getAdminConfigurationStatus(): {
  apiBaseUrlConfigured: boolean;
  internalApiSecretConfigured: boolean;
} {
  return {
    apiBaseUrlConfigured: Boolean(
      process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL,
    ),
    internalApiSecretConfigured: Boolean(process.env.INTERNAL_API_SECRET),
  };
}

export type AdminSnapshot = {
  snapshotId: string;
  canonicalName: string;
  reviewStatus: "pending_review" | "approved" | "rejected";
  region: string;
  countryCode: string;
  primaryRole: string;
  currentOrLastTeam: string;
  championsTitles: number;
  mastersTitles: number;
  heroTop3: [string, string, string];
  dataAsOf: string;
  sourceUrl: string;
};

export async function getSnapshots(
  status: AdminSnapshot["reviewStatus"],
): Promise<AdminSnapshot[]> {
  const { apiBaseUrl, internalApiSecret } = getConfig();
  const response = await fetch(
    `${apiBaseUrl}/internal/v1/admin/snapshots?reviewStatus=${status}`,
    {
      headers: { "x-internal-api-secret": internalApiSecret },
      cache: "no-store",
    },
  );
  if (!response.ok)
    throw new Error(`Unable to load snapshots: ${response.status}`);
  return response.json();
}

export async function updateReview(
  snapshotId: string,
  reviewStatus: "approved" | "rejected",
): Promise<void> {
  const { apiBaseUrl, internalApiSecret } = getConfig();
  const response = await fetch(
    `${apiBaseUrl}/internal/v1/admin/snapshots/${snapshotId}/review`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-internal-api-secret": internalApiSecret,
      },
      body: JSON.stringify({ reviewStatus }),
    },
  );
  if (!response.ok)
    throw new Error(`Unable to update review status: ${response.status}`);
}
