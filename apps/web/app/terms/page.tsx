export const metadata = { title: "服务条款 | 康一把" };

export default function TermsPage() {
  return (
    <main className="legal-page">
      <a href="/" className="back-link">
        返回首页
      </a>
      <p className="eyebrow">TERMS</p>
      <h1>服务条款</h1>
      <p>运营方：康一把。最后更新：2026 年 8 月。适用地区：中国大陆。</p>
      <h2>服务性质</h2>
      <p>
        本服务是面向 VALORANT
        社区的职业选手猜测游戏，仅供娱乐与社区交流。服务不提供现金、虚拟币、抽奖或任何可兑换奖励。
      </p>
      <h2>用户责任</h2>
      <p>
        你不得使用自动化脚本、批量注册、漏洞利用、干扰实时房间或其他破坏公平性的方式使用服务。违反规则的成绩可被隐藏或作废，账户可被限制访问。
      </p>
      <h2>账户与内容</h2>
      <p>
        请妥善保管账户凭据。选手资料来自公开来源并可能随赛事与转会更新；运营方会尽力更正已确认的错误，但不保证资料始终完整或无误。
      </p>
      <h2>联系</h2>
      <p>
        服务、账户或条款问题请联系{" "}
        <a href="mailto:jaytang12221@outlook.com">jaytang12221@outlook.com</a>。
      </p>
    </main>
  );
}
