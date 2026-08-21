/**
 * Central Gemini provider — the ONLY place that knows the model name or
 * calls the API. Everything else calls generateStructured(). No SDK
 * dependency: a single REST call keeps this simple and avoids chasing
 * SDK version churn for what is a very small surface area.
 */

import "server-only";
import { env } from "@/lib/env";

export class GeminiNotConfiguredError extends Error {
  constructor() {
    super("GEMINI_API_KEY is not set — AI features are disabled until it is configured.");
  }
}

export interface GenerateStructuredOptions {
  systemInstruction: string;
  userContent: string;
  responseSchema: object; // JSON Schema (subset Gemini supports)
}

export async function generateStructured<T>(opts: GenerateStructuredOptions): Promise<{ data: T; model: string }> {
  if (!env.geminiApiKey) {
    throw new GeminiNotConfiguredError();
  }
  const model = env.geminiModel;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.geminiApiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.systemInstruction }] },
      contents: [{ role: "user", parts: [{ text: opts.userContent }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: opts.responseSchema,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini API error ${res.status}: ${body.slice(0, 500)}`);
  }

  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini returned no content");
  }

  return { data: JSON.parse(text) as T, model };
}
