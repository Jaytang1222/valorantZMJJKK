import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { sealUserSession, unsealUserSession } from "../../../../lib/user-session";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3001";
const SESSION_COOKIE = "valo_user_session";

export async function POST(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (!["register", "login", "logout", "realtime-ticket"].includes(action)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (action === "logout") { const response = NextResponse.json({ ok: true }); response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0, sameSite: "lax", secure: process.env.NODE_ENV === "production" }); return response; }
  const token = unsealUserSession((await cookies()).get(SESSION_COOKIE)?.value);
  const upstream = await fetch(`${API_BASE_URL}/v1/auth/${action}`, { method: "POST", headers: { ...(action === "realtime-ticket" ? {} : { "content-type": "application/json" }), ...(action === "realtime-ticket" && token ? { authorization: `Bearer ${token}` } : {}) }, body: action === "realtime-ticket" ? undefined : await request.text(), cache: "no-store" });
  const data = await upstream.json();
  if (!upstream.ok) return NextResponse.json(data, { status: upstream.status });
  if (action === "realtime-ticket") return NextResponse.json(data);
  const response = NextResponse.json({ user: data.user });
  response.cookies.set(SESSION_COOKIE, sealUserSession(data.session.token), { httpOnly: true, path: "/", expires: new Date(data.session.expiresAt), sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  return response;
}

export async function GET() {
  const token = unsealUserSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!token) return NextResponse.json({ user: null });
  const upstream = await fetch(`${API_BASE_URL}/v1/auth/me`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!upstream.ok) return NextResponse.json({ user: null });
  return NextResponse.json(await upstream.json());
}

export async function PUT(request: NextRequest) {
  const token = unsealUserSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!token) return NextResponse.json({ error: "Authentication is required" }, { status: 401 });
  const upstream = await fetch(`${API_BASE_URL}/v1/auth/me/display-name`, { method: "PUT", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: await request.text(), cache: "no-store" });
  return NextResponse.json(await upstream.json(), { status: upstream.status });
}
