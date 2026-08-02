import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { importPlayerCsv } from "../../../../lib/admin-api";
import {
  adminCookie,
  isValidAdminSession,
} from "../../../../lib/admin-session";

export async function POST(request: NextRequest) {
  if (!isValidAdminSession((await cookies()).get(adminCookie.name)?.value))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await request.json()) as { csv?: string; apply?: boolean };
    if (!body.csv)
      return NextResponse.json({ error: "CSV is required" }, { status: 400 });
    return NextResponse.json(
      await importPlayerCsv(body.csv, Boolean(body.apply)),
    );
  } catch {
    return NextResponse.json({ error: "CSV import failed" }, { status: 400 });
  }
}
