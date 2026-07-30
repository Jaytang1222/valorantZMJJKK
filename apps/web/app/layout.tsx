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
      <body>{children}</body>
    </html>
  );
}
