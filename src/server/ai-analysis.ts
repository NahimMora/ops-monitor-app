/**
 * On-demand AI analysis (PROMPT §30) — only runs when the admin clicks
 * "Analizar con IA", and only pays for Gemini once per target: results
 * are cached in AiAnalysis keyed by cacheKey, reused until `force`.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { redact } from "@/server/sanitize";
import { generateStructured } from "@/server/gemini";

export interface AiAnalysisResult {
  probable_cause: string;
  evidence: string[];
  what_to_check: string[];
  impact: string;
  recommended_manual_steps: string[];
  confidence: number;
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    probable_cause: { type: "string" },
    evidence: { type: "array", items: { type: "string" } },
    what_to_check: { type: "array", items: { type: "string" } },
    impact: { type: "string" },
    recommended_manual_steps: { type: "array", items: { type: "string" } },
    confidence: { type: "number" },
  },
  required: ["probable_cause", "evidence", "what_to_check", "impact", "recommended_manual_steps", "confidence"],
};

const SYSTEM_INSTRUCTION = `Sos un analista de operaciones. Recibís datos agregados y sanitizados de UN incidente o UNA
ejecución de un pipeline de publicación de noticias. Respondé en español, en JSON según el schema.
Nunca recomiendes ejecutar una acción automáticamente vos mismo — solo pasos manuales que el operador puede tomar.
No inventes datos que no estén en el payload.`;

export async function analyzeIncident(incidentId: string, force = false) {
  const cacheKey = `incident:${incidentId}`;
  if (!force) {
    const cached = await prisma.aiAnalysis.findUnique({ where: { cacheKey } });
    if (cached) return { analysis: cached, created: false };
  }

  const incident = await prisma.incident.findUniqueOrThrow({
    where: { id: incidentId },
    include: { project: true, occurrences: { orderBy: { occurredAt: "desc" }, take: 10 } },
  });

  const payload = {
    project: incident.project.displayName,
    title: redact(incident.title),
    severity: incident.severity,
    occurrenceCount: incident.occurrenceCount,
    affectedRunCount: incident.affectedRunCount,
    firstSeen: incident.firstSeenAt.toISOString(),
    lastSeen: incident.lastSeenAt.toISOString(),
    channel: incident.channel,
    sampleMessages: incident.occurrences.map((o) => redact(o.message).slice(0, 400)),
  };

  const { data, model } = await generateStructured<AiAnalysisResult>({
    systemInstruction: SYSTEM_INSTRUCTION,
    userContent: JSON.stringify(payload),
    responseSchema: RESPONSE_SCHEMA,
  });

  const analysis = await prisma.aiAnalysis.upsert({
    where: { cacheKey },
    create: { target: "INCIDENT", incidentId, model, payload: data as unknown as object, cacheKey },
    update: { model, payload: data as unknown as object, requestedAt: new Date() },
  });

  return { analysis, created: true };
}

export async function analyzeRun(runId: string, force = false) {
  const cacheKey = `run:${runId}`;
  if (!force) {
    const cached = await prisma.aiAnalysis.findUnique({ where: { cacheKey } });
    if (cached) return { analysis: cached, created: false };
  }

  const run = await prisma.run.findUniqueOrThrow({
    where: { id: runId },
    include: { project: true, stages: true },
  });

  const payload = {
    project: run.project.displayName,
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    itemsTotal: run.itemsTotal,
    itemsSuccess: run.itemsSuccess,
    itemsFailed: run.itemsFailed,
    errorCount: run.errorCount,
    warningCount: run.warningCount,
    stages: run.stages.map((s) => ({
      name: s.displayName ?? s.name,
      status: s.status,
      itemsTotal: s.itemsTotal,
      itemsFailed: s.itemsFailed,
      errorSummary: s.errorSummary ? redact(s.errorSummary) : null,
    })),
  };

  const { data, model } = await generateStructured<AiAnalysisResult>({
    systemInstruction: SYSTEM_INSTRUCTION,
    userContent: JSON.stringify(payload),
    responseSchema: RESPONSE_SCHEMA,
  });

  const analysis = await prisma.aiAnalysis.upsert({
    where: { cacheKey },
    create: { target: "RUN", runId, model, payload: data as unknown as object, cacheKey },
    update: { model, payload: data as unknown as object, requestedAt: new Date() },
  });

  return { analysis, created: true };
}
