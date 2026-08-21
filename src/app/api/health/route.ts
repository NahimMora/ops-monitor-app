import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isDatabaseUnavailableError, DATABASE_UNAVAILABLE_BODY, DATABASE_UNAVAILABLE_STATUS } from "@/server/db-error";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", time: new Date().toISOString() });
  } catch (err) {
    // Never leak the underlying driver error (it can echo the attempted
    // username/host) or pretend the app is healthy when the DB isn't
    // reachable — see docs/TROUBLESHOOTING.md "Database unavailable".
    if (isDatabaseUnavailableError(err)) {
      return NextResponse.json(DATABASE_UNAVAILABLE_BODY, { status: DATABASE_UNAVAILABLE_STATUS });
    }
    return NextResponse.json({ status: "error", database: "unknown_error" }, { status: 500 });
  }
}
