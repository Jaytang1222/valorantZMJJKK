import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { downloadPlayerCsv } from "../../../../../lib/admin-api";
import {
  adminCookie,
  isValidAdminSession,
} from "../../../../../lib/admin-session";

export async function GET() {
  if (!isValidAdminSession((await cookies()).get(adminCookie.name)?.value))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { body, filename } = await downloadPlayerCsv();
    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "CSV export failed" }, { status: 502 });
  }
}
