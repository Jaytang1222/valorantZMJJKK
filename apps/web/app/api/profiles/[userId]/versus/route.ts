import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3001";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  const upstream = await fetch(`${API_BASE_URL}/v1/profiles/${userId}/versus`, {
    cache: "no-store",
  });
  return NextResponse.json(await upstream.json(), { status: upstream.status });
}
