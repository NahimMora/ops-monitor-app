import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/server/require-session";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const alert = await prisma.alert.findUnique({ where: { id } });
  if (!alert) {
    return NextResponse.json({ error: "unknown alert" }, { status: 404 });
  }
  if (alert.status !== "FIRING" && alert.status !== "PENDING") {
    return NextResponse.json({ error: `cannot acknowledge an alert in status ${alert.status}` }, { status: 409 });
  }

  const updated = await prisma.alert.update({
    where: { id },
    data: { status: "ACKNOWLEDGED", acknowledgedAt: new Date() },
  });

  await prisma.auditEvent.create({
    data: { actor: session.sub, action: "alert_acknowledged", targetType: "Alert", targetId: id },
  });

  return NextResponse.json({ ok: true, alert: updated });
}
