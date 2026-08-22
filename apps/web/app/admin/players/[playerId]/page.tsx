import Link from "next/link";
import { cookies, headers } from "next/headers";
import { getPlayerDetails } from "../../../../lib/admin-api";
import { requireAdminCapability } from "../../../../lib/admin-operator";
import {
  addAliasAction,
  createPlayerAction,
  removeAliasAction,
  setPlayerStatus,
} from "../../actions";
import { LOCALE_COOKIE, detectLocale, t } from "../../../lib/i18n";

type PageProps = { params: Promise<{ playerId: string }> };

export default async function PlayerPage({ params }: PageProps) {
  await requireAdminCapability("content");
  const cookieStore = await cookies();
  const acceptLanguage = (await headers()).get("accept-language");
  const locale = detectLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage,
  );
  const player = await getPlayerDetails((await params).playerId);
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
        <h2>{t(locale, "admin.newSnapshot")}</h2>
        <p className="admin-summary">
          {t(locale, "admin.snapshotKeepHistory")}
        </p>
        <form action={createPlayerAction} className="player-form">
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
            <input
              name="countryCode"
              defaultValue={player.countryCode}
              required
            />
          </label>
          <label>
            {t(locale, "admin.countryGroup")}
            <input
              name="countryGroup"
              defaultValue={player.countryGroup}
              required
            />
          </label>
          <label>
            {t(locale, "admin.regionLabel")}
            <input name="region" defaultValue={player.region} required />
          </label>
          <label>
            {t(locale, "admin.roleLabel")}
            <input
              name="primaryRole"
              defaultValue={player.primaryRole}
              required
            />
          </label>
          <label>
            {t(locale, "admin.teamLabel")}
            <input
              name="team"
              defaultValue={player.currentOrLastTeam}
              required
            />
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
            {t(locale, "admin.championsAppearances")}
            <input
              name="championsAppearances"
              type="number"
              min="0"
              defaultValue={player.championsAppearances}
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
          <input
            type="hidden"
            name="returnTo"
            value={`/admin/players/${player.id}`}
          />
          <button>{t(locale, "admin.createNewSnapshot")}</button>
        </form>
      </section>
      <section className="admin-create">
        <h2>Snapshot history</h2>
        <div className="snapshot-history">
          {player.history.map((snapshot) => (
            <article key={snapshot.id}>
              <strong>v{snapshot.dataVersion}</strong>
              <span>{snapshot.dataAsOf.slice(0, 10)}</span>
              <span>{snapshot.currentOrLastTeam}</span>
              <span>{snapshot.rosterStatus}</span>
              <span>{snapshot.reviewStatus}</span>
              <a href={snapshot.sourceUrl} target="_blank" rel="noreferrer">
                Source
              </a>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
