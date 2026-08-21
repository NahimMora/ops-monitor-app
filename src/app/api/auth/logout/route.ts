import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/server/auth-service";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return res;
}
