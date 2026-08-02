"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function AccountPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((response) => response.json())
      .then((data) => {
        if (!data.user) router.replace("/login");
        else {
          setDisplayName(data.user.displayName);
          setEmail(data.user.email);
        }
      });
  }, [router]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <a href="/" className="back-link">
          返回首页
        </a>
        <h1>账户</h1>
        <p>{displayName}</p>
        <p>{email}</p>
        <button className="text-button" onClick={logout}>
          退出登录
        </button>
      </section>
    </main>
  );
}
