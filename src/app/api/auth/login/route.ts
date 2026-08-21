import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { login, SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from "@/server/auth-service";
import { env } from "@/lib/env";
import { checkRateLimit } from "@/server/rate-limit";
import { isDatabaseUnavailableError, DATABASE_UNAVAILABLE_BODY, DATABASE_UNAVAILABLE_STATUS } from "@/server/db-error";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limited = checkRateLimit(`login:${ip}`, { maxAttempts: 10, windowSeconds: 60 });
  if (!limited.allowed) {
    return NextResponse.json({ error: "Too many attempts, try again shortly." }, { status: 429 });
  }

  const parsed = LoginSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  let result;
  try {
    result = await login(parsed.data.email, parsed.data.password);
  } catch (err) {
    if (isDatabaseUnavailableError(err)) {
      return NextResponse.json(DATABASE_UNAVAILABLE_BODY, { status: DATABASE_UNAVAILABLE_STATUS });
    }
    throw err;
  }
  if (!result.ok) {
    const message = result.reason === "locked" ? "Account temporarily locked. Try again later." : "Invalid credentials.";
    return NextResponse.json({ error: message }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, result.token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}
