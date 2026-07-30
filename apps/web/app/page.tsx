const API_BASE_URL =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:3001";

async function getApiStatus(): Promise<"online" | "offline"> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2_000),
    });
    return response.ok ? "online" : "offline";
  } catch {
    return "offline";
  }
}

export default async function HomePage() {
  const apiStatus = await getApiStatus();

  return (
    <main>
      <section className="hero">
        <p className="eyebrow">VALORANT PRO PLAYER GUESSING GAME</p>
        <h1>VALO 一把</h1>
        <p className="lead">
          根据赛区、国籍、位置、战队与赛事成就，猜出这位职业选手。
        </p>
        <div className="status" data-online={apiStatus === "online"}>
          API {apiStatus === "online" ? "已连接" : "未连接"}
        </div>
      </section>
      <section className="entries" aria-label="产品入口">
        <article>
          <h2>单人对战</h2>
          <p>入门、简单、完整三种难度；每局 8 次猜测机会。</p>
          <button type="button" disabled>
            即将开放
          </button>
        </article>
        <article>
          <h2>联机对战</h2>
          <p>在线匹配，或通过固定 6 位邀请码与好友开房。</p>
          <button type="button" disabled>
            即将开放
          </button>
        </article>
        <article>
          <h2>查选手</h2>
          <p>按赛区、国籍、位置和战队检索已审核的公开资料。</p>
          <button type="button" disabled>
            即将开放
          </button>
        </article>
      </section>
    </main>
  );
}
