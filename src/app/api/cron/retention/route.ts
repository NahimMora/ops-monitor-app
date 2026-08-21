import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/server/cron-auth";
import { runRetention } from "@/server/retention";

export async function POST(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runRetention();
  return NextResponse.json({ ok: true, ...result });
}
