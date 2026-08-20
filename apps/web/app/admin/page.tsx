import Link from "next/link";
import { cookies, headers } from "next/headers";
import { getAdminConfigurationStatus, getSnapshots } from "../../lib/admin-api";
import { getAdminOperator } from "../../lib/admin-operator";
import {
  createPlayerAction,
  login,
  logout,
  review,
  setPlayerStatus,
} from "./actions";
import { CsvImport } from "./csv-import";
import { LOCALE_COOKIE, detectLocale, t, tWith } from "../lib/i18n";

export const dynamic = "force-dynamic";
type PageProps = {
  searchParams: Promise<{ error?: string; created?: string }>;
};

function NewPlayerForm({ locale }: { locale: "zh" | "en" }) {
  return (
    <details className="admin-create">
      <summary>{t(locale, "admin.create")}</summary>
      <form action={createPlayerAction} className="player-form">
        <label>
          {t(locale, "admin.canonicalName")}
          <input name="canonicalName" required />
        </label>
        <label>
          {t(locale, "admin.aliasesLabel")}
          <input name="aliases" required />
        </label>
        <label>
          {t(locale, "admin.countryCode")}
          <input name="countryCode" maxLength={2} placeholder="CN" required />
        </label>
        <label>
          {t(locale, "admin.countryGroup")}
          <input name="countryGroup" placeholder="east_asia" required />
        </label>
        <label>
          {t(locale, "admin.regionLabel")}
          <select name="region" defaultValue="pacific">
            <option value="americas">Americas</option>
            <option value="emea">EMEA</option>
            <option value="pacific">Pacific</option>
            <option value="china">China</option>
          </select>
        </label>
        <label>
          {t(locale, "admin.roleLabel")}
          <select name="primaryRole" defaultValue="duelist">
            <option value="duelist">Duelist</option>
            <option value="initiator">Initiator</option>
            <option value="controller">Controller</option>
            <option value="sentinel">Sentinel</option>
            <option value="flex">Flex</option>
          </select>
        </label>
        <label>
          {t(locale, "admin.teamLabel")}
          <input name="team" required />
        </label>
        <label>
          {t(locale, "admin.championsTitles")}
          <input
            name="championsTitles"
            type="number"
            min="0"
            defaultValue="0"
            required
          />
        </label>
        <label>
          {t(locale, "admin.mastersTitles")}
          <input
            name="mastersTitles"
            type="number"
            min="0"
            defaultValue="0"
            required
          />
        </label>
        <label>
          {t(locale, "admin.championsAppearances")}
          <input
            name="championsAppearances"
            type="number"
            min="0"
            defaultValue="0"
            required
          />
        </label>
        <label>
          {t(locale, "admin.statusLabel")}
          <select name="isActiveRoster" defaultValue="true">
            <option value="true">{t(locale, "status.active")}</option>
            <option value="false">{t(locale, "status.retired")}</option>
          </select>
        </label>
        <label>
          {t(locale, "admin.dataAsOf")}
          <input name="dataAsOf" type="date" required />
        </label>
        <label>
          {t(locale, "admin.sourceUrl")}
          <input name="sourceUrl" type="url" required />
        </label>
        <button type="submit">{t(locale, "admin.publish")}</button>
      </form>
    </details>
  );
}

export default async function AdminPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const acceptLanguage = (await headers()).get("accept-language");
  const locale = detectLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage,
  );
  const operator = await getAdminOperator();
  if (!operator)
    return (
      <main className="admin-shell">
        <form action={login} className="admin-login">
          <p className="eyebrow">CONTENT OPERATIONS</p>
          <h1>{t(locale, "admin.title")}</h1>
          <label>
            {t(locale, "admin.username")}
            <input name="username" required />
          </label>
          <label>
            {t(locale, "admin.password")}
            <input name="password" type="password" required />
          </label>
          {params.error && <p className="form-error">{t(locale, "admin.loginBad")}</p>}
          <button type="submit">{t(locale, "admin.loginBtn")}</button>
        </form>
      </main>
    );
  const config = getAdminConfigurationStatus();
  if (!config.apiBaseUrlConfigured || !config.internalApiSecretConfigured)
    return (
      <main className="admin-shell">
        <h1>{t(locale, "admin.configNotReady")}</h1>
      </main>
    );
  const snapshots = await getSnapshots("all");
  const pending = snapshots.filter(
    (item) => item.reviewStatus === "pending_review",
  ).length;
  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">CONTENT OPERATIONS</p>
          <h1>{t(locale, "admin.playersHeading")}</h1>
          <p className="admin-summary">
            {tWith(locale, "admin.summary", {
              name: operator.displayName,
              role: operator.role,
            })}
          </p>
        </div>
        <form action={logout}>
          <button className="secondary">{t(locale, "admin.logoutBtn")}</button>
        </form>
      </header>
      <p className="admin-summary">
        {tWith(locale, "admin.snapshotSummary", {
          total: snapshots.length,
          pending,
        })}
      </p>
      {params.created && (
        <p className="success-message">{t(locale, "admin.created")}</p>
      )}
      <NewPlayerForm locale={locale} />
      <CsvImport />
      <section className="snapshot-list">
        {snapshots.map((snapshot) => (
          <article className="snapshot" key={snapshot.snapshotId}>
            <div>
              <h2>
                <Link href={`/admin/players/${snapshot.playerId}`}>
                  {snapshot.canonicalName}
                </Link>{" "}
                <small>{snapshot.reviewStatus}</small>
              </h2>
              <p>
                {snapshot.region} · {snapshot.countryCode} ·{" "}
                {snapshot.primaryRole} · {snapshot.currentOrLastTeam}
              </p>
              <p>
                {t(locale, "admin.championsTitles")} {snapshot.championsTitles} ·{" "}
                {t(locale, "admin.mastersTitles")} {snapshot.mastersTitles} ·{" "}
                {t(locale, "admin.championsAppearances")}{" "}
                {snapshot.championsAppearances}
              </p>
              <a href={snapshot.sourceUrl} target="_blank" rel="noreferrer">
                {t(locale, "admin.viewSource")}
              </a>
            </div>
            <div className="review-actions">
              {snapshot.reviewStatus === "pending_review" && (
                <>
                  <form action={review}>
                    <input
                      type="hidden"
                      name="snapshotId"
                      value={snapshot.snapshotId}
                    />
                    <input type="hidden" name="reviewStatus" value="approved" />
                    <button>{t(locale, "admin.approve")}</button>
                  </form>
                  <form action={review}>
                    <input
                      type="hidden"
                      name="snapshotId"
                      value={snapshot.snapshotId}
                    />
                    <input type="hidden" name="reviewStatus" value="rejected" />
                    <button className="danger">{t(locale, "admin.reject")}</button>
                  </form>
                </>
              )}
              <form action={setPlayerStatus}>
                <input
                  type="hidden"
                  name="playerId"
                  value={snapshot.playerId}
                />
                <input type="hidden" name="status" value="disabled" />
                <button className="secondary">{t(locale, "admin.disable")}</button>
              </form>
            </div>
          </article>
        ))}
      </section>
      <Link href="/" className="back-link">
        {t(locale, "lb.back")}
      </Link>
    </main>
  );
}