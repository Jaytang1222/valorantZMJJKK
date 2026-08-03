export const metadata = { title: "隐私政策 | 康一把" };

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <a href="/" className="back-link">
        返回首页
      </a>
      <p className="eyebrow">PRIVACY</p>
      <h1>隐私政策</h1>
      <p>运营方：康一把。最后更新：2026 年 8 月。</p>
      <h2>收集的数据</h2>
      <p>
        注册时收集邮箱地址和密码哈希。游戏过程中记录已结算的猜测、成绩、房间结算信息及必要的安全日志，用于提供排行榜、战绩、内容审核和防滥用能力。
      </p>
      <h2>使用与保留</h2>
      <p>
        数据仅用于运营本服务、处理安全事件与履行法律义务。账户与审计数据默认保留
        90 天；法律另有要求或存在未处理安全事件时，可在必要范围内延长。
      </p>
      <h2>删除与联系</h2>
      <p>
        你可请求访问、更正或删除个人数据。请使用注册邮箱发送请求至{" "}
        <a href="mailto:jaytang12221@outlook.com">jaytang12221@outlook.com</a>
        ，并说明账户邮箱与请求类型。
      </p>
      <h2>适用范围</h2>
      <p>
        本政策适用于中国大陆地区的本服务用户。继续使用服务即表示你理解本政策所述的数据处理方式。
      </p>
    </main>
  );
}
