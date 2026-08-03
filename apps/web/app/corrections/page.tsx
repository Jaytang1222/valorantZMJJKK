export const metadata = { title: "资料更正 | 康一把" };

export default function CorrectionsPage() {
  return (
    <main className="legal-page">
      <a href="/" className="back-link">
        返回首页
      </a>
      <p className="eyebrow">CORRECTIONS</p>
      <h1>资料更正</h1>
      <p>
        若发现选手资料、别名、赛事成绩或来源存在错误，请发送邮件至{" "}
        <a href="mailto:jaytang12221@outlook.com">jaytang12221@outlook.com</a>。
      </p>
      <p>
        请提供选手名称、问题说明及可公开核验的来源链接。运营方会在核验后更新公开资料或停用错误题目。
      </p>
    </main>
  );
}
