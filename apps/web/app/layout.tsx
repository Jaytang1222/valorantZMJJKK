import type { Metadata } from "next";
import { CircleUserRound, Trophy } from "lucide-react";
import "./styles.css";

export const metadata: Metadata = {
  title: "康一把",
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
              <span className="brand-mark" aria-hidden="true">
                V
              </span>
              <span>康一把</span>
            </a>
            <div className="site-nav-tools">
              <a href="/leaderboards" aria-label="排行榜" title="排行榜">
                <Trophy aria-hidden="true" size={18} />
              </a>
              <a href="/account" aria-label="我的战绩" title="我的战绩">
                <CircleUserRound aria-hidden="true" size={19} />
              </a>
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
