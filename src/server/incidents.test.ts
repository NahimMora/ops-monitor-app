import { describe, it, expect } from "vitest";
import { normalizeErrorMessage, computeFingerprint, severityFor, titleFor } from "./incidents";

describe("normalizeErrorMessage", () => {
  it("collapses messages that only differ by a number", () => {
    const a = normalizeErrorMessage("Timeout after 30021ms waiting for selector");
    const b = normalizeErrorMessage("Timeout after 51ms waiting for selector");
    expect(a).toBe(b);
  });

  it("collapses messages that only differ by a timestamp", () => {
    const a = normalizeErrorMessage("Failed at 2026-08-21T14:02:10Z retrying");
    const b = normalizeErrorMessage("Failed at 2026-08-21T15:17:44Z retrying");
    expect(a).toBe(b);
  });

  it("collapses messages that only differ by a uuid", () => {
    const a = normalizeErrorMessage("run 123e4567-e89b-12d3-a456-426614174000 failed");
    const b = normalizeErrorMessage("run 00000000-0000-0000-0000-000000000000 failed");
    expect(a).toBe(b);
  });

  it("does not collapse genuinely different error text", () => {
    const a = normalizeErrorMessage("WhatsApp navigation timeout");
    const b = normalizeErrorMessage("Facebook Graph API timeout");
    expect(a).not.toBe(b);
  });
});

describe("computeFingerprint", () => {
  it("is stable for the same project/source/normalized message", () => {
    const a = computeFingerprint("lvr", "run_fb.log", "Timeout after 100ms");
    const b = computeFingerprint("lvr", "run_fb.log", "Timeout after 999ms");
    expect(a).toBe(b);
  });

  it("differs across projects even with the same message", () => {
    const a = computeFingerprint("lvr", "run_fb.log", "Timeout");
    const b = computeFingerprint("holasalta-scrapping", "run_fb.log", "Timeout");
    expect(a).not.toBe(b);
  });

  it("differs across sources", () => {
    const a = computeFingerprint("lvr", "run_fb.log", "Timeout");
    const b = computeFingerprint("lvr", "run_ig.log", "Timeout");
    expect(a).not.toBe(b);
  });
});

describe("severityFor", () => {
  it("ERROR starts at HIGH", () => {
    expect(severityFor("ERROR", 1)).toBe("HIGH");
  });

  it("ERROR escalates to CRITICAL past 20 occurrences", () => {
    expect(severityFor("ERROR", 20)).toBe("CRITICAL");
    expect(severityFor("ERROR", 19)).toBe("HIGH");
  });

  it("WARNING starts at WARNING and escalates to HIGH", () => {
    expect(severityFor("WARNING", 1)).toBe("WARNING");
    expect(severityFor("WARNING", 20)).toBe("HIGH");
  });
});

describe("titleFor", () => {
  it("capitalizes and truncates long messages", () => {
    const long = "a".repeat(200);
    const title = titleFor(long);
    expect(title.length).toBeLessThanOrEqual(120);
    expect(title.endsWith("...")).toBe(true);
  });

  it("capitalizes the first letter", () => {
    expect(titleFor("whatsapp timeout")).toBe("Whatsapp timeout");
  });
});
