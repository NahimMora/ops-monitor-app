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
    return NextResponse.json({ ok: true, incident, note: "already resolved" });
  }

  const now = new Date();
  // A manual resolve stops the 30-minute auto-recover clock early
  // (src/server/incidents.ts autoRecoverStaleIncidents) — if a fresh
  // occurrence arrives afterward, recordIncidentOccurrence already
  // un-resolves the incident on its own, so this is safe to do eagerly.
  const updated = await prisma.incident.update({
    where: { id },
    data: { status: "RESOLVED", resolvedAt: now, recoveredAt: now },
  });

  await prisma.auditEvent.create({
    data: { actor: session.sub, action: "incident_resolved", targetType: "Incident", targetId: id },
  });

  return NextResponse.json({ ok: true, incident: updated });
}
