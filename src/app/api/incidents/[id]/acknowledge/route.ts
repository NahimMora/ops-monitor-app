import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/server/require-session";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const incident = await prisma.incident.findUnique({ where: { id } });
  if (!incident) {
    return NextResponse.json({ error: "unknown incident" }, { status: 404 });
  }
  if (incident.status === "RESOLVED") {
    return NextResponse.json({ error: "cannot acknowledge a resolved incident" }, { status: 409 });
  }

  const updated = await prisma.incident.update({
    where: { id },
    data: { status: "ACKNOWLEDGED", acknowledgedAt: incident.acknowledgedAt ?? new Date() },
  });

  await prisma.auditEvent.create({
    data: { actor: session.sub, action: "incident_acknowledged", targetType: "Incident", targetId: id },
  });

  return NextResponse.json({ ok: true, incident: updated });
}
