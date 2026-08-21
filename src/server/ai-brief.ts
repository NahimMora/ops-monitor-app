import "server-only";
import { prisma } from "@/lib/db";
import { generateStructured } from "@/server/gemini";
import { buildDailyBriefPayload, type DailyBriefPayload } from "@/server/ai-payload";

export interface AiBriefResult {
  overall_status: "healthy" | "degraded" | "critical";
  executive_summary: string;
  important_incidents: string[];
  recurring_patterns: string[];
  probable_causes: string[];
  recommended_actions: string[];
  healthy_components: string[];
  risks: string[];
  confidence: number;
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    overall_status: { type: "string", enum: ["healthy", "degraded", "critical"] },
    executive_summary: { type: "string" },
    important_incidents: { type: "array", items: { type: "string" } },
    recurring_patterns: { type: "array", items: { type: "string" } },
    probable_causes: { type: "array", items: { type: "string" } },
    recommended_actions: { type: "array", items: { type: "string" } },
    healthy_components: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    confidence: { type: "number" },
  },
  required: [
    "overall_status",
    "executive_summary",
    "important_incidents",
    "recurring_patterns",
    "probable_causes",
    "recommended_actions",
    "healthy_components",
    "risks",
    "confidence",
  ],
};

const SYSTEM_INSTRUCTION = `Sos un analista de operaciones para un pipeline de publicación de noticias 24/7.
Recibís un resumen YA agregado (no logs crudos) de las últimas 24 horas de tres proyectos de producción.
Respondé en español, en JSON según el schema dado. Sé específico y concreto:
en vez de "hubo algunos errores, revise sus logs", explicá qué pasó, cuántas veces, cuándo, y la causa probable.
Agrupá incidentes relacionados. Si algo se recuperó, decilo explícitamente. No inventes datos que no estén en el payload.`;

/** Idempotent: AiBrief has a unique (windowStart, windowEnd) constraint,
 * so calling this twice for the same window returns the existing brief
 * unless `force` is true (explicit manual regeneration). */
export async function generateDailyBrief(windowStart: Date, windowEnd: Date, force = false) {
  if (!force) {
    const existing = await prisma.aiBrief.findUnique({ where: { windowStart_windowEnd: { windowStart, windowEnd } } });
    if (existing) return { brief: existing, created: false };
  }

  const payload = await buildDailyBriefPayload(windowStart, windowEnd);
  const { data, model } = await generateStructured<AiBriefResult>({
    systemInstruction: SYSTEM_INSTRUCTION,
    userContent: JSON.stringify(payload),
    responseSchema: RESPONSE_SCHEMA,
  });

  const brief = await prisma.aiBrief.upsert({
    where: { windowStart_windowEnd: { windowStart, windowEnd } },
    create: {
      windowStart,
      windowEnd,
      overallStatus: data.overall_status,
      executiveSummary: data.executive_summary,
      payload: data as unknown as object,
      promptFingerprint: fingerprintPayload(payload),
      model,
    },
    update: {
      overallStatus: data.overall_status,
      executiveSummary: data.executive_summary,
      payload: data as unknown as object,
      promptFingerprint: fingerprintPayload(payload),
      model,
      generatedAt: new Date(),
    },
  });

  return { brief, created: true };
}

function fingerprintPayload(payload: DailyBriefPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64").slice(0, 64);
}
