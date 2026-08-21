import { describe, it, expect } from "vitest";
import { dailyBriefWindow, saltaCalendarDay, saltaLocalHourTodayUtc } from "./timezone";

describe("saltaLocalHourTodayUtc", () => {
  it("converts 18:00 Salta-local to the correct fixed UTC-3 instant", () => {
    // Salta has no DST, so 18:00 local is always 21:00 UTC.
    const ref = new Date("2026-08-21T10:00:00Z");
    const result = saltaLocalHourTodayUtc(18, ref);
    expect(result.toISOString()).toBe("2026-08-21T21:00:00.000Z");
  });
});

describe("dailyBriefWindow", () => {
  it("before today's 18:00, the window is [day-before-yesterday 18:00, yesterday 18:00)", () => {
    // 10:00 UTC = 07:00 Salta -> before today's 18:00 Salta boundary
    const ref = new Date("2026-08-21T10:00:00Z");
    const { windowStart, windowEnd } = dailyBriefWindow(ref);
    expect(windowEnd.toISOString()).toBe("2026-08-20T21:00:00.000Z");
    expect(windowStart.toISOString()).toBe("2026-08-19T21:00:00.000Z");
  });

  it("after today's 18:00, the window is [yesterday 18:00, today 18:00)", () => {
    // 22:00 UTC = 19:00 Salta -> after today's 18:00 Salta boundary
    const ref = new Date("2026-08-21T22:00:00Z");
    const { windowStart, windowEnd } = dailyBriefWindow(ref);
    expect(windowEnd.toISOString()).toBe("2026-08-21T21:00:00.000Z");
    expect(windowStart.toISOString()).toBe("2026-08-20T21:00:00.000Z");
  });

  it("window is always exactly 24 hours", () => {
    const { windowStart, windowEnd } = dailyBriefWindow(new Date("2026-08-21T22:00:00Z"));
    expect(windowEnd.getTime() - windowStart.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});

describe("saltaCalendarDay", () => {
  it("returns UTC midnight for the Salta-local calendar day", () => {
    // 02:00 UTC on the 21st = 23:00 Salta on the 20th -> calendar day is the 20th
    const ref = new Date("2026-08-21T02:00:00Z");
    const day = saltaCalendarDay(ref);
    expect(day.toISOString()).toBe("2026-08-20T00:00:00.000Z");
  });
});
