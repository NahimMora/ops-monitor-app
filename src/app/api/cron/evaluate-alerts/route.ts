/**
 * Runs every ~5 minutes from Hostinger Cron, same pattern as the other
 * cron/* routes (see docs/HOSTINGER_DEPLOYMENT.md). Deterministic alert
 * evaluation — see src/server/alerts.ts for the rule engine itself.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/server/cron-auth";
import { evaluateAllAlerts } from "@/server/alerts";

export async function POST(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await evaluateAllAlerts();
  return NextResponse.json({ ok: true, ...result });
}
