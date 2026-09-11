import Link from "next/link";
import { cookies, headers } from "next/headers";
import { getPlayerDetails } from "../../../../lib/admin-api";
import { requireAdminCapability } from "../../../../lib/admin-operator";
import {
  addAliasAction,
  removeAliasAction,
  setPlayerStatus,
  updatePlayerAction,
} from "../../actions";
import { LOCALE_COOKIE, detectLocale, t } from "../../../lib/i18n";
import {
  ADMIN_COUNTRY_CODES,
  ADMIN_COUNTRY_GROUPS,
  ADMIN_PLAYER_ROLES,
  ADMIN_REGIONS,
  ADMIN_TEAMS,
} from "../../../../lib/admin-player-options";

type PageProps = {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<{ updated?: string }>;
};

export default async function PlayerPage({ params, searchParams }: PageProps) {
  await requireAdminCapability("content");
  const cookieStore = await cookies();
  const acceptLanguage = (await headers()).get("accept-language");
  const locale = detectLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage,
  );
  const player = await getPlayerDetails((await params).playerId);
  const query = await searchParams;
  return (
    <main className="admin-shell">
      <Link href="/admin" className="back-link">
        {t(locale, "admin.backToList")}
      </Link>
      <header className="admin-header">
        <div>
          <p className="eyebrow">PLAYER DETAIL</p>
          <h1>{player.canonicalName}</h1>
        </div>
        <form action={setPlayerStatus}>
          <input type="hidden" name="playerId" value={player.id} />
          <input
            type="hidden"
            name="status"
            value={player.status === "active" ? "disabled" : "active"}
          />
          <button className="secondary">
            {player.status === "active"
              ? t(locale, "admin.disable")
              : t(locale, "admin.enable")}
          </button>
        </form>
      </header>
      <section className="admin-create">
        <h2>{t(locale, "admin.aliases")}</h2>
        <div className="alias-list">
          {player.aliases.map((alias) => (
            <form action={removeAliasAction} key={alias.id}>
              <span>{alias.alias}</span>
              <input type="hidden" name="playerId" value={player.id} />
              <input type="hidden" name="aliasId" value={alias.id} />
              <button className="danger">
                {t(locale, "admin.deleteAlias")}
              </button>
            </form>
          ))}
        </div>
        <form action={addAliasAction} className="inline-form">
          <input type="hidden" name="playerId" value={player.id} />
          <input
            name="alias"
            placeholder={t(locale, "admin.addAliasPlaceholder")}
            required
          />
          <button>{t(locale, "admin.addAliasBtn")}</button>
        </form>
      </section>
      <section className="admin-create">
        <h2>{t(locale, "admin.editCurrent")}</h2>
        <p className="admin-summary">
          {t(locale, "admin.snapshotUpdatePending")}
        </p>
        {query.updated && (
          <p className="success-message">{t(locale, "admin.updated")}</p>
        )}
        <form action={updatePlayerAction} className="player-form">
          <input type="hidden" name="playerId" value={player.id} />
          <input
            type="hidden"
            name="isCoach"
            value={String(player.isCoach ?? false)}
          />
          <input
            type="hidden"
            name="isFeaturedTeam"
            value={String(player.isFeaturedTeam ?? false)}
          />
          <input
            type="hidden"
            name="isVctCnTeam"
            value={String(player.isVctCnTeam ?? false)}
          />
          <label>
            {t(locale, "admin.canonicalName")}
            <input
              name="canonicalName"
              defaultValue={player.canonicalName}
              required
            />
          </label>
          <label>
            {t(locale, "admin.aliasesLabel")}
            <input
              name="aliases"
              defaultValue={player.aliases
                .map((alias) => alias.alias)
                .join("|")}
              required
            />
          </label>
          <label>
            {t(locale, "admin.countryCode")}
            <select
              name="countryCode"
              defaultValue={player.countryCode}
              required
            >
              {!ADMIN_COUNTRY_CODES.includes(
                player.countryCode as (typeof ADMIN_COUNTRY_CODES)[number],
              ) && (
                <option value={player.countryCode}>{player.countryCode}</option>
              )}
              {ADMIN_COUNTRY_CODES.map((code) => (
                <option key={code}>{code}</option>
              ))}
            </select>
          </label>
          <label>
            {t(locale, "admin.countryGroup")}
            <select
              name="countryGroup"
              defaultValue={player.countryGroup}
              required
            >
              {!ADMIN_COUNTRY_GROUPS.includes(
                player.countryGroup as (typeof ADMIN_COUNTRY_GROUPS)[number],
              ) && (
                <option value={player.countryGroup}>
                  {player.countryGroup}
                </option>
              )}
              {ADMIN_COUNTRY_GROUPS.map((group) => (
                <option key={group}>{group}</option>
              ))}
            </select>
          </label>
          <label>
            {t(locale, "col.age")}
            <input
              name="age"
              type="number"
              min="13"
              max="60"
              defaultValue={player.age}
              required
            />
          </label>
          <label>
            {t(locale, "admin.regionLabel")}
            <select name="region" defaultValue={player.region} required>
              {ADMIN_REGIONS.map((region) => (
                <option key={region} value={region}>
                  {region.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="admin-fieldset">
            <legend>{t(locale, "admin.roleLabel")}</legend>
            <div
              className="admin-checkbox-grid"
              role="group"
              aria-label="Roles"
            >
              {ADMIN_PLAYER_ROLES.map((role) => (
                <label key={role}>
                  <input
                    type="checkbox"
                    name="roles"
                    value={role}
                    defaultChecked={(
                      player.roles ?? [player.primaryRole]
                    ).includes(role)}
                  />
                  {role}
                </label>
              ))}
            </div>
          </fieldset>
          <label>
            {t(locale, "admin.teamLabel")}
            <select
              name="team"
              defaultValue={player.currentOrLastTeam}
              required
            >
              {!ADMIN_TEAMS.includes(
                player.currentOrLastTeam as (typeof ADMIN_TEAMS)[number],
              ) && (
                <option value={player.currentOrLastTeam}>
                  {player.currentOrLastTeam}
                </option>
              )}
              {ADMIN_TEAMS.map((team) => (
                <option key={team}>{team}</option>
              ))}
            </select>
          </label>
          <label>
            {t(locale, "admin.championsTitles")}
            <input
              name="championsTitles"
              type="number"
              min="0"
              defaultValue={player.championsTitles}
              required
            />
          </label>
          <label>
            {t(locale, "admin.mastersTitles")}
            <input
              name="mastersTitles"
              type="number"
              min="0"
              defaultValue={player.mastersTitles}
              required
            />
          </label>
          <label>
            {t(locale, "admin.leagueTitles")}
            <input
              name="leagueTitles"
              type="number"
              min="0"
              defaultValue={player.leagueTitles}
              required
            />
          </label>
          <label>
            {t(locale, "admin.statusLabel")}
            <select
              name="isActiveRoster"
              defaultValue={player.isActiveRoster === false ? "false" : "true"}
            >
              <option value="true">{t(locale, "status.active")}</option>
              <option value="false">{t(locale, "status.retired")}</option>
            </select>
          </label>
          <label>
            Roster state
            <select name="rosterStatus" defaultValue={player.rosterStatus}>
              <option value="active">Active</option>
              <option value="benched">Benched / substitute</option>
              <option value="inactive">Inactive</option>
              <option value="transferred">Transferred</option>
              <option value="retired">Retired</option>
            </select>
          </label>
          <label>
            {t(locale, "admin.dataAsOf")}
            <input
              name="dataAsOf"
              type="date"
              defaultValue={player.dataAsOf}
              required
            />
          </label>
          <label>
            {t(locale, "admin.sourceUrl")}
            <input
              name="sourceUrl"
              type="url"
              defaultValue={player.sourceUrl}
              required
            />
          </label>
          <button>{t(locale, "admin.saveChanges")}</button>
        </form>
      </section>
    </main>
  );
}
