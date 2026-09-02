import "./load-env";

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
  adminAuthConfigured: boolean;
} {
  return {
    apiBaseUrlConfigured: Boolean(
      process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL,
    ),
    internalApiSecretConfigured: Boolean(process.env.INTERNAL_API_SECRET),
    adminAuthConfigured: Boolean(
      process.env.ADMIN_USERNAME &&
      process.env.ADMIN_PASSWORD &&
      process.env.ADMIN_SESSION_SECRET,
    ),
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
  rosterStatus: "active" | "benched" | "transferred" | "retired" | "inactive";
  championsTitles: number;
  mastersTitles: number;
  leagueTitles: number;
  isActiveRoster: boolean;
  dataAsOf: string;
  sourceUrl: string;
};

export type AdminUserStats = {
  totalScore: number;
  gamesPlayed: number;
  wins: number;
  totalGuesses: number;
  averageGuesses: number;
  winRate: number;
};

export type AdminUser = {
  id: string;
  displayName: string;
  email: string | null;
  role: "user" | "editor" | "moderator" | "admin";
  createdAt: string;
  stats: {
    solo: AdminUserStats | null;
    versus: AdminUserStats | null;
  };
};

export type PlayerInput = {
  canonicalName: string;
  aliases: string[];
  countryCode: string;
  countryGroup: string;
  region: "americas" | "emea" | "pacific" | "china";
  primaryRole: "duelist" | "initiator" | "controller" | "sentinel" | "flex";
  currentOrLastTeam: string;
  rosterStatus: "active" | "benched" | "transferred" | "retired" | "inactive";
  championsTitles: number;
  mastersTitles: number;
  leagueTitles: number;
  isCoach?: boolean;
  isFeaturedTeam?: boolean;
  isVctCnTeam?: boolean;
  isActiveRoster?: boolean;
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
  filters: {
    region?: string;
    team?: string;
    rosterStatus?: string;
    q?: string;
    page?: number;
    limit?: number;
  } = {},
): Promise<{
  items: AdminSnapshot[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  const { apiBaseUrl, internalApiSecret } = getConfig();
  const response = await fetch(
    `${apiBaseUrl}/internal/v1/admin/snapshots?${new URLSearchParams({
      reviewStatus: status,
      ...Object.fromEntries(
        Object.entries(filters).filter(([, value]) => value),
      ),
    })}`,
    {
      headers: { "x-internal-api-secret": internalApiSecret },
      cache: "no-store",
    },
  );
  if (!response.ok)
    throw new Error(`Unable to load snapshots: ${response.status}`);
  return response.json();
}

export async function getAdminUsers(
  filters: {
    q?: string;
    page?: number;
    limit?: number;
  } = {},
): Promise<{
  items: AdminUser[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  const { apiBaseUrl, internalApiSecret } = getConfig();
  const response = await fetch(
    `${apiBaseUrl}/internal/v1/admin/users?${new URLSearchParams(
      Object.fromEntries(
        Object.entries(filters)
          .filter(([, value]) => value !== undefined)
          .map(([key, value]) => [key, String(value)]),
      ),
    )}`,
    {
      headers: { "x-internal-api-secret": internalApiSecret },
      cache: "no-store",
    },
  );
  if (!response.ok) throw new Error(`Unable to load users: ${response.status}`);
  return response.json();
}

export type AdminUserInput = {
  email: string;
  password: string;
  displayName?: string;
  role?: "user" | "admin";
};

export async function createAdminUser(
  data: AdminUserInput,
): Promise<AdminUser> {
  const { apiBaseUrl, internalApiSecret } = getConfig();
  const response = await fetch(`${apiBaseUrl}/internal/v1/admin/users`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-api-secret": internalApiSecret,
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Unable to create user: ${response.status}${detail ? ` ${detail}` : ""}`,
    );
  }
  return response.json();
}

export async function resetAdminUserPassword(userId: string): Promise<string> {
  const { apiBaseUrl, internalApiSecret } = getConfig();
  const response = await fetch(
    `${apiBaseUrl}/internal/v1/admin/users/${userId}/password-reset`,
    {
      method: "POST",
      headers: { "x-internal-api-secret": internalApiSecret },
    },
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Unable to reset password: ${response.status}${detail ? ` ${detail}` : ""}`,
    );
  }
  const data = (await response.json()) as { temporaryPassword: string };
  return data.temporaryPassword;
}

export async function deleteAdminUser(userId: string): Promise<void> {
  const { apiBaseUrl, internalApiSecret } = getConfig();
  const response = await fetch(
    `${apiBaseUrl}/internal/v1/admin/users/${userId}`,
    {
      method: "DELETE",
      headers: { "x-internal-api-secret": internalApiSecret },
    },
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Unable to delete user: ${response.status}${detail ? ` ${detail}` : ""}`,
    );
  }
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

export async function updatePlayer(
  playerId: string,
  data: PlayerInput,
): Promise<void> {
  const { apiBaseUrl, internalApiSecret } = getConfig();
  const response = await fetch(
    `${apiBaseUrl}/internal/v1/admin/players/${playerId}`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-internal-api-secret": internalApiSecret,
      },
      body: JSON.stringify(data),
    },
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Unable to update player: ${response.status}${detail ? ` ${detail}` : ""}`,
    );
  }
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

export async function importPlayerCsv(csv: string, apply: boolean) {
  const { apiBaseUrl, internalApiSecret } = getConfig();
  const response = await fetch(
    `${apiBaseUrl}/internal/v1/admin/players/import`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-api-secret": internalApiSecret,
      },
      body: JSON.stringify({ csv, apply }),
    },
  );
  if (!response.ok) throw new Error(`Unable to import CSV: ${response.status}`);
  return response.json() as Promise<{
    validRows: number;
    errors: { row: number; errors: string[] }[];
    conflicts: { canonicalName: string; resolution: string }[];
    imported?: unknown[];
  }>;
}
