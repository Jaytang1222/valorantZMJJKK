import { cookies, headers } from "next/headers";
import Link from "next/link";
import {
  getAdminConfigurationStatus,
  getAdminUsers,
  getSnapshots,
  type AdminUser,
} from "../../lib/admin-api";
import { getAdminOperator } from "../../lib/admin-operator";
import {
  createPlayerAction,
  createUserAction,
  deleteUserAction,
  login,
  logout,
  review,
  resetUserPasswordAction,
  setPlayerStatus,
} from "./actions";
import { CsvImport } from "./csv-import";
import { ConfirmDeleteUserButton } from "./confirm-delete-user";
import { LOCALE_COOKIE, detectLocale, t, tWith } from "../lib/i18n";

export const dynamic = "force-dynamic";
type PageProps = {
  searchParams: Promise<{
    error?: string;
    created?: string;
    q?: string;
    team?: string;
    region?: string;
    rosterStatus?: string;
    page?: string;
    reviewStatus?: "pending_review" | "approved" | "rejected" | "all";
    section?: "players" | "users";
    userQ?: string;
    userPage?: string;
    createdUser?: string;
    resetUser?: string;
    deletedUser?: string;
  }>;
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
          {t(locale, "admin.leagueTitles")}
          <input
            name="leagueTitles"
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
          Roster state
          <select name="rosterStatus" defaultValue="active">
            <option value="active">Active</option>
            <option value="benched">Benched / substitute</option>
            <option value="inactive">Inactive</option>
            <option value="transferred">Transferred</option>
            <option value="retired">Retired</option>
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

function NewUserForm({ locale }: { locale: "zh" | "en" }) {
  return (
    <details className="admin-create">
      <summary>{t(locale, "admin.createUser")}</summary>
      <form action={createUserAction} className="player-form">
        <label>
          {t(locale, "admin.email")}
          <input name="email" type="email" required />
        </label>
        <label>
          {t(locale, "admin.initialPassword")}
          <input name="password" type="password" minLength={8} required />
        </label>
        <label>
          {t(locale, "admin.displayNameOptional")}
          <input name="displayName" maxLength={20} />
        </label>
        <label>
          {t(locale, "admin.userRole")}
          <select name="role" defaultValue="user">
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
        </label>
        <button type="submit">{t(locale, "admin.createUser")}</button>
      </form>
    </details>
  );
}

function UserManagement({
  locale,
  users,
  query,
}: {
  locale: "zh" | "en";
  users: {
    items: AdminUser[];
    total: number;
    page: number;
    totalPages: number;
  };
  query: { q?: string };
}) {
  const pageUrl = (page: number) => {
    const params = new URLSearchParams({
      section: "users",
      userPage: String(page),
    });
    if (query.q) params.set("userQ", query.q);
    return `/admin?${params.toString()}`;
  };
  return (
    <>
      <NewUserForm locale={locale} />
      <form method="get" className="admin-filters user-filters">
        <input type="hidden" name="section" value="users" />
        <input
          name="userQ"
          defaultValue={query.q}
          placeholder={t(locale, "admin.email")}
        />
        <button type="submit">Filter</button>
        <Link href="/admin?section=users" className="back-link">
          Clear
        </Link>
      </form>
      <p className="admin-summary">{users.total} users</p>
      <section className="snapshot-list user-list">
        {users.items.map((user) => {
          const solo = user.stats.solo;
          const versus = user.stats.versus;
          return (
            <article className="snapshot user-row" key={user.id}>
              <div>
                <h2>
                  {user.displayName} <small>{user.role}</small>
                </h2>
                <p>{user.email ?? "-"}</p>
                <p>
                  {tWith(locale, "admin.userStats", {
                    soloGames: solo?.gamesPlayed ?? 0,
                    soloWins: solo?.wins ?? 0,
                    soloRate: Math.round((solo?.winRate ?? 0) * 100),
                    soloAvg: solo?.averageGuesses ?? 0,
                    versusGames: versus?.gamesPlayed ?? 0,
                    versusWins: versus?.wins ?? 0,
                    versusRate: Math.round((versus?.winRate ?? 0) * 100),
                    versusAvg: versus?.averageGuesses ?? 0,
                  })}
                </p>
              </div>
              <div className="review-actions">
                <form action={resetUserPasswordAction}>
                  <input type="hidden" name="userId" value={user.id} />
                  <button className="secondary">
                    {t(locale, "admin.resetPassword")}
                  </button>
                </form>
                <form action={deleteUserAction}>
                  <input type="hidden" name="userId" value={user.id} />
                  <ConfirmDeleteUserButton
                    label={t(locale, "admin.deleteUser")}
                    message={t(locale, "admin.confirmDeleteUser")}
                  />
                </form>
              </div>
            </article>
          );
        })}
      </section>
      <nav className="admin-pagination" aria-label="User pages">
        {users.page > 1 && <Link href={pageUrl(users.page - 1)}>Previous</Link>}
        <span>
          {users.page} / {users.totalPages}
        </span>
        {users.page < users.totalPages && (
          <Link href={pageUrl(users.page + 1)}>Next</Link>
        )}
      </nav>
    </>
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
  const config = getAdminConfigurationStatus();
  if (
    !config.apiBaseUrlConfigured ||
    !config.internalApiSecretConfigured ||
    !config.adminAuthConfigured
  )
    return (
      <main className="admin-shell">
        <h1>{t(locale, "admin.configNotReady")}</h1>
      </main>
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
          {params.error && (
            <p className="form-error">{t(locale, "admin.loginBad")}</p>
          )}
          <button type="submit">{t(locale, "admin.loginBtn")}</button>
        </form>
      </main>
    );
  const userSection = params.section === "users";
  const snapshots = userSection
    ? null
    : await getSnapshots(params.reviewStatus ?? "all", {
        q: params.q,
        team: params.team,
        region: params.region,
        rosterStatus: params.rosterStatus,
        page: Math.max(1, Number(params.page ?? "1") || 1),
        limit: 100,
      });
  const adminUsers = userSection
    ? await getAdminUsers({
        q: params.userQ,
        page: Math.max(1, Number(params.userPage ?? "1") || 1),
        limit: 50,
      })
    : null;
  const pending =
    snapshots?.items.filter((item) => item.reviewStatus === "pending_review")
      .length ?? 0;
  const pageUrl = (page: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params))
      if (value) next.set(key, value);
    next.set("page", String(page));
    return `/admin?${next.toString()}`;
  };
  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">CONTENT OPERATIONS</p>
          <h1>
            {t(
              locale,
              userSection ? "admin.usersHeading" : "admin.playersHeading",
            )}
          </h1>
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
      <nav className="admin-tabs" aria-label="Admin sections">
        <Link className={!userSection ? "active" : ""} href="/admin">
          {t(locale, "admin.playersTab")}
        </Link>
        <Link
          className={userSection ? "active" : ""}
          href="/admin?section=users"
        >
          {t(locale, "admin.usersTab")}
        </Link>
      </nav>
      {userSection && adminUsers ? (
        <>
          {params.createdUser && (
            <p className="success-message">{t(locale, "admin.userCreated")}</p>
          )}
          {params.resetUser && (
            <p className="success-message">
              {t(locale, "admin.userPasswordReset")}
            </p>
          )}
          {params.deletedUser && (
            <p className="success-message">{t(locale, "admin.userDeleted")}</p>
          )}
          <UserManagement
            locale={locale}
            users={adminUsers}
            query={{ q: params.userQ }}
          />
        </>
      ) : snapshots ? (
        <>
          <p className="admin-summary">
            {tWith(locale, "admin.snapshotSummary", {
              total: snapshots.total,
              pending,
              page: snapshots.page,
            })}
          </p>
          {params.created && (
            <p className="success-message">{t(locale, "admin.created")}</p>
          )}
          <NewPlayerForm locale={locale} />
          <CsvImport />
          <form method="get" className="admin-filters">
            <input name="q" defaultValue={params.q} placeholder="Player name" />
            <input name="team" defaultValue={params.team} placeholder="Team" />
            <select name="region" defaultValue={params.region ?? ""}>
              <option value="">All regions</option>
              <option value="americas">Americas</option>
              <option value="emea">EMEA</option>
              <option value="pacific">Pacific</option>
              <option value="china">China</option>
            </select>
            <select
              name="rosterStatus"
              defaultValue={params.rosterStatus ?? ""}
            >
              <option value="">All roster states</option>
              <option value="active">Active</option>
              <option value="benched">Benched / substitute</option>
              <option value="inactive">Inactive</option>
              <option value="transferred">Transferred</option>
              <option value="retired">Retired</option>
            </select>
            <select
              name="reviewStatus"
              defaultValue={params.reviewStatus ?? "all"}
            >
              <option value="all">All review states</option>
              <option value="pending_review">Pending review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <button type="submit">Filter</button>
            <Link href="/admin" className="back-link">
              Clear
            </Link>
          </form>
          <section className="snapshot-list">
            {snapshots.items.map((snapshot) => (
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
                    {t(locale, "admin.championsTitles")}{" "}
                    {snapshot.championsTitles} ·{" "}
                    {t(locale, "admin.mastersTitles")} {snapshot.mastersTitles}{" "}
                    · {t(locale, "admin.leagueTitles")} {snapshot.leagueTitles}
                  </p>
                  <p>Roster state: {snapshot.rosterStatus}</p>
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
                        <input
                          type="hidden"
                          name="reviewStatus"
                          value="approved"
                        />
                        <button>{t(locale, "admin.approve")}</button>
                      </form>
                      <form action={review}>
                        <input
                          type="hidden"
                          name="snapshotId"
                          value={snapshot.snapshotId}
                        />
                        <input
                          type="hidden"
                          name="reviewStatus"
                          value="rejected"
                        />
                        <button className="danger">
                          {t(locale, "admin.reject")}
                        </button>
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
                    <button className="secondary">
                      {t(locale, "admin.disable")}
                    </button>
                  </form>
                </div>
              </article>
            ))}
          </section>
          <nav className="admin-pagination" aria-label="Admin pages">
            {snapshots.page > 1 && (
              <Link href={pageUrl(snapshots.page - 1)}>Previous</Link>
            )}
            <span>
              {snapshots.page} / {snapshots.totalPages}
            </span>
            {snapshots.page < snapshots.totalPages && (
              <Link href={pageUrl(snapshots.page + 1)}>Next</Link>
            )}
          </nav>
        </>
      ) : null}
      <Link href="/" className="back-link">
        {t(locale, "lb.back")}
      </Link>
    </main>
  );
}
