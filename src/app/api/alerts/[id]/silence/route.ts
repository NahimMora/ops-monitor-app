import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/server/require-session";

const SilenceSchema = z.object({ minutes: z.number().int().positive().max(24 * 60) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = SilenceSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request — expected { minutes: number }" }, { status: 400 });
  }

  const { id } = await params;
  const alert = await prisma.alert.findUnique({ where: { id } });
  if (!alert) {
    return NextResponse.json({ error: "unknown alert" }, { status: 404 });
  }
  if (alert.status === "RESOLVED") {
    return NextResponse.json({ error: "cannot silence a resolved alert" }, { status: 409 });
  }

  const silencedUntil = new Date(Date.now() + parsed.data.minutes * 60 * 1000);
  const updated = await prisma.alert.update({
    where: { id },
    data: { status: "SILENCED", silencedUntil },
  });

  await prisma.auditEvent.create({
    data: { actor: session.sub, action: "alert_silenced", targetType: "Alert", targetId: id, metadata: { minutes: parsed.data.minutes } },
  });

  return NextResponse.json({ ok: true, alert: updated });
}
