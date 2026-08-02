"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      const data = await response.json();
      setError(data.error ?? "操作失败，请稍后重试。");
      return;
    }
    router.push("/account");
    router.refresh();
  }
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <a href="/" className="back-link">
          返回首页
        </a>
        <h1>{mode === "login" ? "登录" : "注册"}</h1>
        <p>注册后将获得唯一默认昵称，并可在后续修改。</p>
        <form onSubmit={submit} className="auth-form">
          <label>
            邮箱
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            密码
            <input
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button type="submit">
            {mode === "login" ? "登录" : "创建账号"}
          </button>
        </form>
        <button
          className="text-button"
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError("");
          }}
        >
          {mode === "login" ? "没有账号？注册" : "已有账号？登录"}
        </button>
      </section>
    </main>
  );
}
