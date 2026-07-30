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
  playerId: string;
  playerStatus: "active" | "disabled";
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

export type PlayerInput = {
  canonicalName: string;
  aliases: string[];
  countryCode: string;
  countryGroup: string;
  region: "americas" | "emea" | "pacific" | "china";
  primaryRole: "duelist" | "initiator" | "controller" | "sentinel" | "flex";
  currentOrLastTeam: string;
  championsTitles: number;
  mastersTitles: number;
  heroTop3: [string, string, string];
  dataAsOf: string;
  sourceUrl: string;
  sourceCheckedAt: string;
  reviewStatus: "pending_review" | "approved";
};

export type PlayerDetails = Omit<PlayerInput, "aliases"> & {
  id: string;
  snapshotId: string;
  status: "active" | "disabled";
  aliases: { id: string; alias: string }[];
};

export async function getSnapshots(
  status: AdminSnapshot["reviewStatus"] | "all",
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

export async function createPlayer(data: PlayerInput): Promise<void> {
  const { apiBaseUrl, internalApiSecret } = getConfig();
  const response = await fetch(`${apiBaseUrl}/internal/v1/admin/players`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-api-secret": internalApiSecret,
    },
    body: JSON.stringify(data),
  });
  if (!response.ok)
    throw new Error(`Unable to create player: ${response.status}`);
}

export async function updatePlayerStatus(
  playerId: string,
  status: "active" | "disabled",
): Promise<void> {
  const { apiBaseUrl, internalApiSecret } = getConfig();
  const response = await fetch(
    `${apiBaseUrl}/internal/v1/admin/players/${playerId}/status`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-internal-api-secret": internalApiSecret,
      },
      body: JSON.stringify({ status }),
    },
  );
  if (!response.ok)
    throw new Error(`Unable to update player status: ${response.status}`);
}

export async function getPlayerDetails(
  playerId: string,
): Promise<PlayerDetails> {
  const { apiBaseUrl, internalApiSecret } = getConfig();
  const response = await fetch(
    `${apiBaseUrl}/internal/v1/admin/players/${playerId}`,
    {
      headers: { "x-internal-api-secret": internalApiSecret },
      cache: "no-store",
    },
  );
  if (!response.ok)
    throw new Error(`Unable to load player: ${response.status}`);
  const player = await response.json();
  return {
    ...player,
    countryGroup: player.countryGroup,
    dataAsOf: new Date(player.dataAsOf).toISOString().slice(0, 10),
    sourceCheckedAt: player.sourceCheckedAt,
    aliases: player.aliases,
  };
}

export async function addAlias(playerId: string, alias: string): Promise<void> {
  const { apiBaseUrl, internalApiSecret } = getConfig();
  const response = await fetch(
    `${apiBaseUrl}/internal/v1/admin/players/${playerId}/aliases`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-api-secret": internalApiSecret,
      },
      body: JSON.stringify({ alias }),
    },
  );
  if (!response.ok) throw new Error(`Unable to add alias: ${response.status}`);
}

export async function removeAlias(
  playerId: string,
  aliasId: string,
): Promise<void> {
  const { apiBaseUrl, internalApiSecret } = getConfig();
  const response = await fetch(
    `${apiBaseUrl}/internal/v1/admin/players/${playerId}/aliases/${aliasId}`,
    {
      method: "DELETE",
      headers: { "x-internal-api-secret": internalApiSecret },
    },
  );
  if (!response.ok)
    throw new Error(`Unable to remove alias: ${response.status}`);
}
