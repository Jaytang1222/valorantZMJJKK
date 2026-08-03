import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { unsealUserSession } from "../../../../lib/user-session";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3001";

export async function GET() {
  const token = unsealUserSession(
    (await cookies()).get("valo_user_session")?.value,
  );
  if (!token)
    return NextResponse.json(
      { error: "Authentication is required" },
      { status: 401 },
    );
  const upstream = await fetch(`${API_BASE_URL}/v1/account/summary`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return NextResponse.json(await upstream.json(), { status: upstream.status });
}
