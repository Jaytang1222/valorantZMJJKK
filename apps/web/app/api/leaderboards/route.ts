import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { unsealUserSession } from "../../../lib/user-session";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3001";

export async function GET(request: NextRequest) {
  const token = unsealUserSession(
    (await cookies()).get("valo_user_session")?.value,
  );
  const upstream = await fetch(
    `${API_BASE_URL}/v1/leaderboards${request.nextUrl.search}`,
    {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      cache: "no-store",
    },
  );
  return NextResponse.json(await upstream.json(), { status: upstream.status });
}
