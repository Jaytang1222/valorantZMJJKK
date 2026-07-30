import { cookies } from "next/headers";
import Link from "next/link";
import { adminCookie, isValidAdminSession } from "../../lib/admin-session";
import { getAdminConfigurationStatus, getSnapshots } from "../../lib/admin-api";
import { login, logout, review } from "./actions";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ error?: string }> };

export default async function AdminPage({ searchParams }: PageProps) {
  const store = await cookies();
  const isAuthenticated = isValidAdminSession(
    store.get(adminCookie.name)?.value,
  );
  const params = await searchParams;

  if (!isAuthenticated) {
    return (
      <main className="admin-shell">
        <form action={login} className="admin-login">
          <p className="eyebrow">CONTENT OPERATIONS</p>
          <h1>管理后台</h1>
          <label>
            账号
            <input name="username" autoComplete="username" required />
          </label>
          <label>
            密码
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {params.error && <p className="form-error">账号或密码不正确。</p>}
          <button type="submit">登录</button>
        </form>
      </main>
    );
  }

  const configuration = getAdminConfigurationStatus();
  if (
    !configuration.apiBaseUrlConfigured ||
    !configuration.internalApiSecretConfigured
  ) {
    return (
      <main className="admin-shell">
        <header className="admin-header">
          <div>
            <p className="eyebrow">CONTENT OPERATIONS</p>
            <h1>后台配置未完成</h1>
          </div>
          <form action={logout}>
            <button type="submit" className="secondary">
              退出
            </button>
          </form>
        </header>
        <p className="form-error">
          Vercel 服务端未读到以下变量：
          {!configuration.apiBaseUrlConfigured && " API_BASE_URL"}
          {!configuration.internalApiSecretConfigured && " INTERNAL_API_SECRET"}
        </p>
        <p className="admin-summary">
          请在 Vercel 的 Production 环境确认变量后，从 Deployments
          页面重新部署当前提交。
        </p>
      </main>
    );
  }

  const pendingSnapshots = await getSnapshots("pending_review");
  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">CONTENT OPERATIONS</p>
          <h1>待审核选手快照</h1>
        </div>
        <form action={logout}>
          <button type="submit" className="secondary">
            退出
          </button>
        </form>
      </header>
      <p className="admin-summary">
        当前 {pendingSnapshots.length}{" "}
        条待审核资料。批准后会出现在“查选手”公开结果中。
      </p>
      <section className="snapshot-list">
        {pendingSnapshots.map((snapshot) => (
          <article className="snapshot" key={snapshot.snapshotId}>
            <div>
              <h2>{snapshot.canonicalName}</h2>
              <p>
                {snapshot.region} · {snapshot.countryCode} ·{" "}
                {snapshot.primaryRole} · {snapshot.currentOrLastTeam}
              </p>
              <p>
                冠军赛 {snapshot.championsTitles} · 大师赛{" "}
                {snapshot.mastersTitles} · {snapshot.heroTop3.join(" / ")}
              </p>
              <a href={snapshot.sourceUrl} target="_blank" rel="noreferrer">
                查看来源
              </a>
            </div>
            <div className="review-actions">
              <form action={review}>
                <input
                  type="hidden"
                  name="snapshotId"
                  value={snapshot.snapshotId}
                />
                <input type="hidden" name="reviewStatus" value="approved" />
                <button type="submit">批准</button>
              </form>
              <form action={review}>
                <input
                  type="hidden"
                  name="snapshotId"
                  value={snapshot.snapshotId}
                />
                <input type="hidden" name="reviewStatus" value="rejected" />
                <button type="submit" className="danger">
                  拒绝
                </button>
              </form>
            </div>
          </article>
        ))}
        {pendingSnapshots.length === 0 && (
          <p className="empty-state">没有待审核选手快照。</p>
        )}
      </section>
      <Link href="/" className="back-link">
        返回首页
      </Link>
    </main>
  );
}
