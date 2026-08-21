/**
 * POST from Hostinger Cron at 18:00 America/Argentina/Salta (see
 * docs/HOSTINGER_DEPLOYMENT.md for the exact cron expression, compensated
 * for whatever timezone Hostinger's cron actually runs in).
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/server/cron-auth";
import { dailyBriefWindow } from "@/lib/timezone";
import { generateDailyBrief } from "@/server/ai-brief";
import { GeminiNotConfiguredError } from "@/server/gemini";

export async function POST(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const force = req.nextUrl.searchParams.get("force") === "true";
  const { windowStart, windowEnd } = dailyBriefWindow();

  try {
    const { brief, created } = await generateDailyBrief(windowStart, windowEnd, force);
    return NextResponse.json({ ok: true, created, brief_id: brief.id, overall_status: brief.overallStatus });
  } catch (err) {
    if (err instanceof GeminiNotConfiguredError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 501 });
    }
    throw err;
  }
}
