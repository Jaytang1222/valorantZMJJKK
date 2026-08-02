import { NextRequest, NextResponse } from "next/server";
const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3001";
export async function GET(request: NextRequest) {
  const response = await fetch(
    `${API_BASE_URL}/v1/players${request.nextUrl.search}`,
    { cache: "no-store" },
  );
  return NextResponse.json(await response.json(), { status: response.status });
}
