import Link from "next/link";
import { getPlayerDetails } from "../../../../lib/admin-api";
import { requireAdminCapability } from "../../../../lib/admin-operator";
import {
  addAliasAction,
  createPlayerAction,
  removeAliasAction,
  setPlayerStatus,
} from "../../actions";

type PageProps = { params: Promise<{ playerId: string }> };

export default async function PlayerPage({ params }: PageProps) {
  await requireAdminCapability("content");
  const player = await getPlayerDetails((await params).playerId);
  return (
    <main className="admin-shell">
      <Link href="/admin" className="back-link">
        返回选手列表
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
            {player.status === "active" ? "禁用" : "恢复"}
          </button>
        </form>
      </header>
      <section className="admin-create">
        <h2>别名</h2>
        <div className="alias-list">
          {player.aliases.map((alias) => (
            <form action={removeAliasAction} key={alias.id}>
              <span>{alias.alias}</span>
              <input type="hidden" name="playerId" value={player.id} />
              <input type="hidden" name="aliasId" value={alias.id} />
              <button className="danger">删除</button>
            </form>
          ))}
        </div>
        <form action={addAliasAction} className="inline-form">
          <input type="hidden" name="playerId" value={player.id} />
          <input name="alias" placeholder="新增别名" required />
          <button>添加别名</button>
        </form>
      </section>
      <section className="admin-create">
        <h2>创建新资料快照</h2>
        <p className="admin-summary">提交后会保留旧快照并创建新的公开版本。</p>
        <form action={createPlayerAction} className="player-form">
          <label>
            标准名
            <input
              name="canonicalName"
              defaultValue={player.canonicalName}
              required
            />
          </label>
          <label>
            别名（以 | 分隔）
            <input
              name="aliases"
              defaultValue={player.aliases
                .map((alias) => alias.alias)
                .join("|")}
              required
            />
          </label>
          <label>
            国籍 ISO 代码
            <input
              name="countryCode"
              defaultValue={player.countryCode}
              required
            />
          </label>
          <label>
            国籍分区
            <input
              name="countryGroup"
              defaultValue={player.countryGroup}
              required
            />
          </label>
          <label>
            赛区
            <input name="region" defaultValue={player.region} required />
          </label>
          <label>
            主位置
            <input
              name="primaryRole"
              defaultValue={player.primaryRole}
              required
            />
          </label>
          <label>
            当前或最近战队
            <input
              name="team"
              defaultValue={player.currentOrLastTeam}
              required
            />
          </label>
          <label>
            冠军赛冠军次数
            <input
              name="championsTitles"
              type="number"
              min="0"
              defaultValue={player.championsTitles}
              required
            />
          </label>
          <label>
            大师赛冠军次数
            <input
              name="mastersTitles"
              type="number"
              min="0"
              defaultValue={player.mastersTitles}
              required
            />
          </label>
          <label>
            英雄 Top 3（以 | 分隔）
            <input
              name="heroTop3"
              defaultValue={player.heroTop3.join("|")}
              required
            />
          </label>
          <label>
            资料快照日
            <input
              name="dataAsOf"
              type="date"
              defaultValue={player.dataAsOf}
              required
            />
          </label>
          <label>
            来源 URL
            <input
              name="sourceUrl"
              type="url"
              defaultValue={player.sourceUrl}
              required
            />
          </label>
          <button>创建新快照</button>
        </form>
      </section>
    </main>
  );
}
