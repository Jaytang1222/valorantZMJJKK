import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "VALO 一把",
  description: "猜猜这位 VALORANT 职业选手是谁。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <nav className="site-nav" aria-label="主导航">
          <div className="site-nav-inner">
            <a className="site-brand" href="/">
              瓦一把
            </a>
            <div>
              <a href="/leaderboards">排行榜</a>
              <a href="/account">我的战绩</a>
            </div>
          </div>
        </nav>
        {children}
        <footer className="site-footer">
          <a href="/privacy">隐私政策</a>
          <a href="/terms">服务条款</a>
          <a href="/data-sources">数据与商标声明</a>
          <a href="/corrections">资料更正</a>
        </footer>
      </body>
    </html>
  );
}
