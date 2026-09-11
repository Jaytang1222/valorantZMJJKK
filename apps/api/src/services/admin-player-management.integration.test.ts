import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";

const databaseTestsEnabled = process.env.RUN_DATABASE_TESTS === "true";
const testSuite = databaseTestsEnabled ? describe : describe.skip;
const database = databaseTestsEnabled
  ? await import("../db/client.js")
  : undefined;
const schema = databaseTestsEnabled
  ? await import("../db/schema.js")
  : undefined;
const application = databaseTestsEnabled
  ? await import("../app.js")
  : undefined;

testSuite("admin player management views and export", () => {
  const suffix = randomUUID().slice(0, 8);
  const playerIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const snapshotIds = playerIds.map(() => randomUUID());
  let app: Awaited<ReturnType<NonNullable<typeof application>["buildApp"]>>;

  beforeAll(async () => {
    if (!database || !schema || !application)
      throw new Error("Database integration test dependencies are unavailable");
    const now = new Date();
    await database.db.insert(schema.players).values([
      {
        id: playerIds[0],
        canonicalName: `Published ${suffix}`,
        status: "active",
      },
      {
        id: playerIds[1],
        canonicalName: `Pending ${suffix}`,
        status: "active",
      },
      {
        id: playerIds[2],
        canonicalName: `Disabled ${suffix}`,
        status: "disabled",
      },
      {
        id: playerIds[3],
        canonicalName: `Overlap, \"${suffix}\"`,
        status: "disabled",
      },
    ]);
    await database.db.insert(schema.playerSnapshots).values([
      {
        id: snapshotIds[0],
        playerId: playerIds[0],
        dataVersion: 1,
        countryCode: "CN",
        countryGroupCode: "east_asia",
        region: "china",
        primaryRole: "duelist",
        playerRoles: ["duelist", "flex"],
        currentOrLastTeam: "Test Team",
        dataAsOf: now,
        sourceUrl: "https://example.test/published",
        sourceCheckedAt: now,
        reviewStatus: "approved",
      },
      {
        id: snapshotIds[1],
        playerId: playerIds[1],
        dataVersion: 1,
        countryCode: "US",
        countryGroupCode: "north_america",
        age: 21,
        region: "americas",
        primaryRole: "initiator",
        playerRoles: ["initiator"],
        currentOrLastTeam: "Pending Team",
        dataAsOf: now,
        sourceUrl: "https://example.test/pending",
        sourceCheckedAt: now,
        reviewStatus: "pending_review",
      },
      {
        id: snapshotIds[2],
        playerId: playerIds[2],
        dataVersion: 1,
        countryCode: "KR",
        countryGroupCode: "east_asia",
        age: 22,
        region: "pacific",
        primaryRole: "controller",
        playerRoles: ["controller"],
        currentOrLastTeam: "Disabled Team",
        dataAsOf: now,
        sourceUrl: "https://example.test/disabled",
        sourceCheckedAt: now,
        reviewStatus: "approved",
      },
      {
        id: snapshotIds[3],
        playerId: playerIds[3],
        dataVersion: 1,
        countryCode: "CA",
        countryGroupCode: "north_america",
        age: 23,
        region: "americas",
        primaryRole: "sentinel",
        playerRoles: ["sentinel"],
        currentOrLastTeam: 'Team, "with punctuation"',
        dataAsOf: now,
        sourceUrl: "https://example.test/overlap",
        sourceCheckedAt: now,
        reviewStatus: "rejected",
      },
    ]);
    app = await application.buildApp();
  });

  afterAll(async () => {
    if (!database || !schema) return;
    await app?.close();
    await database.db
      .delete(schema.playerSnapshots)
      .where(inArray(schema.playerSnapshots.playerId, playerIds));
    await database.db
      .delete(schema.players)
      .where(inArray(schema.players.id, playerIds));
    await database.closeDatabase();
  });

  const request = (url: string, options: Record<string, unknown> = {}) =>
    app.inject({
      url,
      headers: { "x-internal-api-secret": process.env.INTERNAL_API_SECRET },
      ...(options as object),
    });

  it("separates published, pending and disabled views", async () => {
    const filter = `q=${encodeURIComponent(suffix)}`;
    const published = await request(
      `/internal/v1/admin/snapshots?view=published&${filter}`,
    );
    expect(published.statusCode).toBe(200);
    expect(
      published.json().items.map((item: { playerId: string }) => item.playerId),
    ).toEqual([playerIds[0]]);
    expect(published.json().items[0].age).toBe(20);

    const publicPublished = await app.inject({
      url: `/v1/players/${playerIds[0]}`,
    });
    expect(publicPublished.statusCode).toBe(200);
    expect(publicPublished.json().age).toBe(20);

    const hiddenPending = await app.inject({
      url: `/v1/players/${playerIds[1]}`,
    });
    expect(hiddenPending.statusCode).toBe(404);

    const hiddenDisabled = await app.inject({
      url: `/v1/players/${playerIds[2]}`,
    });
    expect(hiddenDisabled.statusCode).toBe(404);

    const legacy = await request(
      `/internal/v1/admin/snapshots?reviewStatus=approved&${filter}`,
    );
    expect(legacy.statusCode).toBe(200);
    expect(
      legacy
        .json()
        .items.map((item: { playerId: string }) => item.playerId)
        .sort(),
    ).toEqual([playerIds[0], playerIds[2]].sort());

    const pending = await request(
      `/internal/v1/admin/snapshots?view=pending&${filter}`,
    );
    expect(pending.statusCode).toBe(200);
    expect(
      pending
        .json()
        .items.map((item: { playerId: string }) => item.playerId)
        .sort(),
    ).toEqual([playerIds[1], playerIds[3]].sort());

    const disabled = await request(
      `/internal/v1/admin/snapshots?view=disabled&${filter}`,
    );
    expect(disabled.statusCode).toBe(200);
    expect(
      disabled
        .json()
        .items.map((item: { playerId: string }) => item.playerId)
        .sort(),
    ).toEqual([playerIds[2], playerIds[3]].sort());
  });

  it("toggles status and exports every latest snapshot as escaped CSV", async () => {
    const updatePlayer = await request(
      `/internal/v1/admin/players/${playerIds[1]}`,
      {
        method: "PATCH",
        payload: {
          canonicalName: `Pending ${suffix}`,
          aliases: [`pending-${suffix}`],
          countryCode: "US",
          countryGroup: "north_america",
          age: 27,
          region: "americas",
          primaryRole: "initiator",
          roles: ["initiator", "flex"],
          currentOrLastTeam: "Pending Team",
          rosterStatus: "active",
          isActiveRoster: true,
          isCoach: false,
          isFeaturedTeam: false,
          isVctCnTeam: false,
          championsTitles: 0,
          mastersTitles: 0,
          leagueTitles: 0,
          dataAsOf: "2026-09-08",
          sourceUrl: "https://example.test/pending-updated",
          sourceCheckedAt: "2026-09-08T00:00:00.000Z",
          reviewStatus: "pending_review",
        },
      },
    );
    expect(updatePlayer.statusCode).toBe(200);
    const details = await request(`/internal/v1/admin/players/${playerIds[1]}`);
    expect(details.statusCode).toBe(200);
    expect(details.json().roles).toEqual(["initiator", "flex"]);
    expect(details.json().age).toBe(27);

    const approve = await request(
      `/internal/v1/admin/snapshots/${details.json().snapshotId}/review`,
      {
        method: "PATCH",
        payload: { reviewStatus: "approved" },
      },
    );
    expect(approve.statusCode).toBe(200);

    const publicApproved = await app.inject({
      url: `/v1/players/${playerIds[1]}`,
    });
    expect(publicApproved.statusCode).toBe(200);
    expect(publicApproved.json().age).toBe(27);

    const legacyCsv = [
      "canonical_name,aliases,country_code,country_group,region,primary_role,current_or_last_team,roster_status,is_active_roster,is_coach,is_featured_team,is_vct_cn_team,champions_titles,masters_titles,league_titles,data_as_of,source_url,source_checked_at,review_status",
      `Pending ${suffix},pending-${suffix},US,north_america,americas,initiator,Pending Team,active,true,false,false,false,0,0,0,2026-09-08,https://example.test/pending-updated,2026-09-08T00:00:00.000Z,pending_review`,
    ].join("\n");
    const legacyImport = await request("/internal/v1/admin/players/import", {
      method: "POST",
      payload: { csv: legacyCsv, apply: true },
    });
    expect(legacyImport.statusCode).toBe(201);
    const afterLegacyImport = await request(
      `/internal/v1/admin/players/${playerIds[1]}`,
    );
    expect(afterLegacyImport.statusCode).toBe(200);
    expect(afterLegacyImport.json().age).toBe(27);

    const update = await request(
      `/internal/v1/admin/players/${playerIds[0]}/status`,
      {
        method: "PATCH",
        payload: { status: "disabled" },
      },
    );
    expect(update.statusCode).toBe(200);
    expect(update.json().status).toBe("disabled");

    const exportResponse = await request("/internal/v1/admin/players/export");
    expect(exportResponse.statusCode).toBe(200);
    expect(exportResponse.headers["content-type"]).toContain("text/csv");
    const csv = exportResponse.body;
    expect(csv.startsWith("\ufeffcanonical_name,aliases")).toBe(true);
    expect(csv).toContain("country_group,age,region");
    expect(csv).toContain("US,north_america,27,americas,initiator");
    expect(csv).toContain(`"Overlap, \"\"${suffix}\"\""`);
    expect(csv).toContain("rejected,disabled");

    const restore = await request(
      `/internal/v1/admin/players/${playerIds[0]}/status`,
      {
        method: "PATCH",
        payload: { status: "active" },
      },
    );
    expect(restore.statusCode).toBe(200);
    expect(restore.json().status).toBe("active");
  });

  it("rejects requests without the internal secret", async () => {
    const response = await app.inject({
      url: "/internal/v1/admin/players/export",
    });
    expect(response.statusCode).toBe(401);

    const statusResponse = await app.inject({
      method: "PATCH",
      url: `/internal/v1/admin/players/${playerIds[0]}/status`,
      payload: { status: "disabled" },
    });
    expect(statusResponse.statusCode).toBe(401);
  });
});
