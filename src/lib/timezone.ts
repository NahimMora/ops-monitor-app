/**
 * Everything is stored in UTC (see prisma/schema.prisma). This module is
 * the only place that formats timestamps for the Salta-local UI, and the
 * only place that computes the Salta-local calendar day used for
 * DailyMetric rollups and the 18:00 daily AI brief window.
 */

import { env } from "@/lib/env";

const TIME_ZONE = env.appTimezone;

export function formatSaltaDateTime(date: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: TIME_ZONE,
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

export function formatSaltaTime(date: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: TIME_ZONE,
    timeStyle: "short",
  }).format(date);
}

/** Returns the UTC instant corresponding to a given local wall-clock hour
 * (0-23) in Salta today, for the process's current moment. Salta is
 * fixed UTC-3 year-round (no DST), so this is a plain offset — but kept
 * as a function so it stays correct if that ever changes. */
export function saltaLocalHourTodayUtc(hour: number, referenceUtc: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(referenceUtc);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;

  // Salta offset is a fixed -03:00 (Argentina does not observe DST).
  const isoLocal = `${y}-${m}-${d}T${String(hour).padStart(2, "0")}:00:00-03:00`;
  return new Date(isoLocal);
}

/** The most recent 18:00 Salta boundary at or before `referenceUtc`,
 * and the one before that — i.e. the daily brief window
 * [previous18:00, today18:00). */
export function dailyBriefWindow(referenceUtc: Date = new Date()): { windowStart: Date; windowEnd: Date } {
  const today18 = saltaLocalHourTodayUtc(18, referenceUtc);
  if (referenceUtc >= today18) {
    const yesterday = new Date(referenceUtc.getTime() - 24 * 60 * 60 * 1000);
    return { windowStart: saltaLocalHourTodayUtc(18, yesterday), windowEnd: today18 };
  }
  const yesterday = new Date(referenceUtc.getTime() - 24 * 60 * 60 * 1000);
  const yesterday18 = saltaLocalHourTodayUtc(18, yesterday);
  const dayBefore = new Date(referenceUtc.getTime() - 48 * 60 * 60 * 1000);
  return { windowStart: saltaLocalHourTodayUtc(18, dayBefore), windowEnd: yesterday18 };
}

/** Salta-local calendar day (as a UTC-midnight Date) for DailyMetric rows. */
export function saltaCalendarDay(referenceUtc: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(referenceUtc);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return new Date(`${y}-${m}-${d}T00:00:00.000Z`);
}
