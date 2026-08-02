import Link from "next/link";
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

export const dynamic = "force-dynamic";
type PageProps = {
  searchParams: Promise<{ error?: string; created?: string }>;
};

function NewPlayerForm() {
  return (
    <details className="admin-create">
      <summary>录入选手</summary>
      <form action={createPlayerAction} className="player-form">
        <label>
          标准名
          <input name="canonicalName" required />
        </label>
        <label>
          别名（以 | 分隔）
          <input name="aliases" required />
        </label>
        <label>
          国籍 ISO 代码
          <input name="countryCode" maxLength={2} placeholder="CN" required />
        </label>
        <label>
          国籍分区
          <input name="countryGroup" placeholder="east_asia" required />
        </label>
        <label>
          赛区
          <select name="region" defaultValue="pacific">
            <option value="americas">Americas</option>
            <option value="emea">EMEA</option>
            <option value="pacific">Pacific</option>
            <option value="china">China</option>
          </select>
        </label>
        <label>
          主位置
          <select name="primaryRole" defaultValue="duelist">
            <option value="duelist">Duelist</option>
            <option value="initiator">Initiator</option>
            <option value="controller">Controller</option>
            <option value="sentinel">Sentinel</option>
            <option value="flex">Flex</option>
          </select>
        </label>
        <label>
          当前或最近战队
          <input name="team" required />
        </label>
        <label>
          冠军赛冠军次数
          <input
            name="championsTitles"
            type="number"
            min="0"
            defaultValue="0"
            required
          />
        </label>
        <label>
          大师赛冠军次数
          <input
            name="mastersTitles"
            type="number"
            min="0"
            defaultValue="0"
            required
          />
        </label>
        <label>
          英雄 Top 3（以 | 分隔）
          <input name="heroTop3" placeholder="Jett|Raze|Omen" required />
        </label>
        <label>
          资料快照日
          <input name="dataAsOf" type="date" required />
        </label>
        <label>
          来源 URL
          <input name="sourceUrl" type="url" required />
        </label>
        <button type="submit">创建并公开</button>
      </form>
    </details>
  );
}

export default async function AdminPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const operator = await getAdminOperator();
  if (!operator)
    return (
      <main className="admin-shell">
        <form action={login} className="admin-login">
          <p className="eyebrow">CONTENT OPERATIONS</p>
          <h1>管理后台</h1>
          <label>
            账号
            <input name="username" required />
          </label>
          <label>
            密码
            <input name="password" type="password" required />
          </label>
          {params.error && <p className="form-error">账号或密码不正确。</p>}
          <button type="submit">登录</button>
        </form>
      </main>
    );
  const config = getAdminConfigurationStatus();
  if (!config.apiBaseUrlConfigured || !config.internalApiSecretConfigured)
    return (
      <main className="admin-shell">
        <h1>后台配置未完成</h1>
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
          <h1>选手资料管理</h1>
          <p className="admin-summary">
            当前身份：{operator.displayName}（{operator.role}）
          </p>
        </div>
        <form action={logout}>
          <button className="secondary">退出</button>
        </form>
      </header>
      <p className="admin-summary">
        共 {snapshots.length} 条快照，其中 {pending}{" "}
        条待审核。编辑选手会创建新快照，历史版本不会被覆盖。
      </p>
      {params.created && (
        <p className="success-message">选手快照已创建并公开。</p>
      )}
      <NewPlayerForm />
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
                冠军赛 {snapshot.championsTitles} · 大师赛{" "}
                {snapshot.mastersTitles} · {snapshot.heroTop3.join(" / ")}
              </p>
              <a href={snapshot.sourceUrl} target="_blank" rel="noreferrer">
                查看来源
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
                    <button>批准</button>
                  </form>
                  <form action={review}>
                    <input
                      type="hidden"
                      name="snapshotId"
                      value={snapshot.snapshotId}
                    />
                    <input type="hidden" name="reviewStatus" value="rejected" />
                    <button className="danger">拒绝</button>
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
                <button className="secondary">禁用</button>
              </form>
            </div>
          </article>
        ))}
      </section>
      <Link href="/" className="back-link">
        返回首页
      </Link>
    </main>
  );
}
