import { describe, expect, it } from "vitest";
import { evaluateMachineDiskLow, evaluateNoRecentSuccess, evaluateSuccessRateLow } from "@/server/alerts";

describe("evaluateMachineDiskLow", () => {
  it("does not breach when no telemetry exists yet", () => {
    const result = evaluateMachineDiskLow({ forMinutes: 10 }, { diskFreeMb: null });
    expect(result.breach).toBe(false);
  });

  it("breaches below the threshold", () => {
    const result = evaluateMachineDiskLow({ forMinutes: 10, thresholdMb: 5000 }, { diskFreeMb: 1200 });
    expect(result.breach).toBe(true);
    expect(result.message).toContain("1200");
  });

  it("does not breach above the threshold", () => {
    const result = evaluateMachineDiskLow({ forMinutes: 10, thresholdMb: 5000 }, { diskFreeMb: 20000 });
    expect(result.breach).toBe(false);
  });
});

describe("evaluateNoRecentSuccess", () => {
  it("does not breach when no run has ever succeeded", () => {
    const result = evaluateNoRecentSuccess({ forMinutes: 0 }, { minutesSinceLastSuccess: null });
    expect(result.breach).toBe(false);
  });

  it("breaches once staleness exceeds the threshold", () => {
    const result = evaluateNoRecentSuccess({ forMinutes: 0, thresholdMinutes: 90 }, { minutesSinceLastSuccess: 120 });
    expect(result.breach).toBe(true);
  });

  it("does not breach within the threshold", () => {
    const result = evaluateNoRecentSuccess({ forMinutes: 0, thresholdMinutes: 90 }, { minutesSinceLastSuccess: 10 });
    expect(result.breach).toBe(false);
  });
});

describe("evaluateSuccessRateLow", () => {
  it("does not breach below the minimum sample size", () => {
    const result = evaluateSuccessRateLow(
      { forMinutes: 10, minSamples: 3 },
      { runs: [{ status: "FAILED" }, { status: "FAILED" }] }
    );
    expect(result.breach).toBe(false);
  });

  it("breaches when the finished-run success rate drops below threshold", () => {
    const runs = [
      { status: "SUCCESS" },
      { status: "FAILED" },
      { status: "FAILED" },
      { status: "FAILED" },
    ];
    const result = evaluateSuccessRateLow({ forMinutes: 10, thresholdPercent: 60, minSamples: 3 }, { runs });
    expect(result.breach).toBe(true);
  });

  it("does not breach with a healthy success rate", () => {
    const runs = [{ status: "SUCCESS" }, { status: "SUCCESS" }, { status: "SUCCESS" }, { status: "FAILED" }];
    const result = evaluateSuccessRateLow({ forMinutes: 10, thresholdPercent: 60, minSamples: 3 }, { runs });
    expect(result.breach).toBe(false);
  });

  it("ignores in-flight runs when computing the denominator", () => {
    const runs = [{ status: "SUCCESS" }, { status: "SUCCESS" }, { status: "SUCCESS" }, { status: "RUNNING" }];
    const result = evaluateSuccessRateLow({ forMinutes: 10, thresholdPercent: 60, minSamples: 3 }, { runs });
    expect(result.breach).toBe(false);
    expect((result.value as { sampleCount: number }).sampleCount).toBe(3);
  });
});
