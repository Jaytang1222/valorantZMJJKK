"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function AccountPage() {
  const router = useRouter(); const [displayName, setDisplayName] = useState(""); const [email, setEmail] = useState(""); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  useEffect(() => { fetch("/api/auth/me").then((response) => response.json()).then((data) => { if (!data.user) router.replace("/login"); else { setDisplayName(data.user.displayName); setEmail(data.user.email); } }); }, [router]);
  async function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setMessage(""); setError(""); const response = await fetch("/api/auth/me", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName }) }); const data = await response.json(); if (!response.ok) setError(data.error ?? "无法保存昵称。"); else setMessage("昵称已更新。"); }
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); router.push("/"); router.refresh(); }
  return <main className="auth-page"><section className="auth-panel"><a href="/" className="back-link">返回首页</a><h1>账户</h1><p>{email}</p><form className="auth-form" onSubmit={save}><label>显示名<input minLength={3} maxLength={20} value={displayName} onChange={(event) => setDisplayName(event.target.value)} required /></label>{error && <p className="form-error">{error}</p>}{message && <p className="success-message">{message}</p>}<button>保存昵称</button></form><button className="text-button" onClick={logout}>退出登录</button></section></main>;
}
