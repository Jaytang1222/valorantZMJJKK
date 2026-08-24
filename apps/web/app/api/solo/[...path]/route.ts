import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { unsealUserSession } from "../../../../lib/user-session";
import {
  getRateLimitProxy,
  setRateLimitCookie,
} from "../../../../lib/rate-limit-proxy";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3001";
async function forward(request: NextRequest, path: string[]) {
  const token = unsealUserSession(
    (await cookies()).get("valo_user_session")?.value,
  );
  const proxy = getRateLimitProxy(request);
  const upstream = await fetch(
    `${API_BASE_URL}/v1/solo/${path.join("/")}${request.nextUrl.search}`,
    {
      method: request.method,
      headers: {
        ...proxy.headers,
        ...(request.method === "GET"
          ? {}
          : { "content-type": "application/json" }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: request.method === "GET" ? undefined : await request.text(),
      cache: "no-store",
    },
  );
  const response = NextResponse.json(await upstream.json(), {
    status: upstream.status,
  });
  setRateLimitCookie(response, proxy.cookieValue);
  return response;
}
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return forward(request, (await params).path);
}
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return forward(request, (await params).path);
}
