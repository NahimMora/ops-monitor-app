import { NextResponse } from "next/server";
import { env } from "@/lib/env";

// The VAPID *public* key is, by design, safe to expose to any client —
// it's what the browser uses to open a push subscription, analogous to
// a public key in any asymmetric scheme.
export async function GET() {
  return NextResponse.json({ publicKey: env.vapidPublicKey || null });
}
