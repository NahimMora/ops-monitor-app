import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/server/require-session";
import { analyzeRun } from "@/server/ai-analysis";
import { GeminiNotConfiguredError } from "@/server/gemini";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const force = req.nextUrl.searchParams.get("force") === "true";
  try {
    const { analysis, created } = await analyzeRun(id, force);
    return NextResponse.json({ ok: true, created, analysis });
  } catch (err) {
    if (err instanceof GeminiNotConfiguredError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 501 });
    }
    throw err;
  }
}
