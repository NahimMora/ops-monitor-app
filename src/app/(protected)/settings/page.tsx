import { prisma } from "@/lib/db";
import { NotificationToggle } from "@/components/notification-toggle";
import { formatSaltaDateTime } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const auditEvents = await prisma.auditEvent.findMany({ orderBy: { occurredAt: "desc" }, take: 30 });

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-text-primary">Settings</h1>

      <section className="mb-6 rounded-xl border border-border-subtle bg-surface-1 p-4">
        <h2 className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-text-tertiary uppercase">Notifications</h2>
        <NotificationToggle />
      </section>

      <section>
        <h2 className="mb-3 text-[11px] font-semibold tracking-[0.14em] text-text-tertiary uppercase">Audit log</h2>
        <div className="space-y-1.5">
          {auditEvents.length === 0 && (
            <div className="rounded-xl border border-dashed border-border-subtle p-4 text-xs text-text-tertiary">No audit events yet.</div>
          )}
          {auditEvents.map((event) => (
            <div key={event.id} className="rounded-lg border border-border-subtle bg-surface-1 px-3 py-2 text-xs">
              <div className="text-text-primary">
                {event.action} <span className="text-text-tertiary">by {event.actor}</span>
              </div>
              <div className="font-mono text-text-tertiary">{formatSaltaDateTime(event.occurredAt)}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
