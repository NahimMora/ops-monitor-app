/**
 * Central place that reads process.env. Nothing else in the app should
 * touch process.env directly — this keeps required-secret validation in
 * one spot and avoids failing `next build` when a secret is legitimately
 * absent at build time (Hostinger provides them at runtime).
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const env = {
  nodeEnv: optional("NODE_ENV", "development"),
  isProduction: process.env.NODE_ENV === "production",

  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get appUrl() {
    return optional("APP_URL", "http://localhost:3000");
  },
  get appTimezone() {
    return optional("APP_TIMEZONE", "America/Argentina/Salta");
  },

  get adminEmail() {
    return required("ADMIN_EMAIL");
  },
  get adminPasswordHash() {
    return required("ADMIN_PASSWORD_HASH");
  },
  get sessionSecret() {
    return required("SESSION_SECRET");
  },

  get agentSecrets(): Record<string, string> {
    // AGENT_SECRETS="agent-id-1:secret1,agent-id-2:secret2" — supports
    // multiple agents even though today there's exactly one machine.
    const raw = required("AGENT_SECRETS");
    const out: Record<string, string> = {};
    for (const pair of raw.split(",")) {
      const [id, secret] = pair.split(":");
      if (id && secret) out[id.trim()] = secret.trim();
    }
    return out;
  },

  get geminiApiKey() {
    return process.env.GEMINI_API_KEY ?? "";
  },
  get geminiModel() {
    return optional("GEMINI_MODEL", "gemini-3.1-flash-lite");
  },

  get cronSecret() {
    return required("CRON_SECRET");
  },

  get vapidPublicKey() {
    return process.env.VAPID_PUBLIC_KEY ?? "";
  },
  get vapidPrivateKey() {
    return process.env.VAPID_PRIVATE_KEY ?? "";
  },
  get vapidSubject() {
    return optional("VAPID_SUBJECT", "mailto:admin@moraapps.com");
  },
};
