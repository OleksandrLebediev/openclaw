import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import type { AgentTimeWindow } from "../config/types.base.js";
import {
  computeBusyDelayMs,
  computeReadingDelayMs,
  computeWritingDelayMs,
  hasAvailabilityWindow,
  isInTimeWindow,
  msUntilLeaveTimeWindow,
  msUntilWindowStart,
  normalizeInactiveWindows,
  resolveAgentAvailabilityConfig,
  resolveAgentTimezone,
} from "./availability.js";

// Fixed reference point: Wednesday 2026-04-15 14:30 UTC
// We use UTC so test results don't depend on the machine's local timezone.
const WEDNESDAY_14_30_UTC = new Date("2026-04-15T14:30:00.000Z");

// Helper: build a Date at the given UTC time string.
const d = (iso: string) => new Date(iso);

describe("resolveAgentTimezone", () => {
  it("returns IANA string as-is", () => {
    expect(resolveAgentTimezone("Europe/Kyiv")).toBe("Europe/Kyiv");
  });

  it('returns local timezone for "local"', () => {
    const result = resolveAgentTimezone("local");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns local timezone when undefined", () => {
    const result = resolveAgentTimezone(undefined);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("isInTimeWindow", () => {
  const tz = "UTC";

  it("returns true when no start/end are set", () => {
    const window: AgentTimeWindow = {};
    expect(isInTimeWindow(window, WEDNESDAY_14_30_UTC, tz)).toBe(true);
  });

  it("returns true when time is inside window", () => {
    const window: AgentTimeWindow = { start: "09:00", end: "18:00" };
    expect(isInTimeWindow(window, d("2026-04-15T12:00:00Z"), tz)).toBe(true);
  });

  it("returns false when time is before window start", () => {
    const window: AgentTimeWindow = { start: "09:00", end: "18:00" };
    expect(isInTimeWindow(window, d("2026-04-15T08:00:00Z"), tz)).toBe(false);
  });

  it("returns false when time is after window end", () => {
    const window: AgentTimeWindow = { start: "09:00", end: "18:00" };
    expect(isInTimeWindow(window, d("2026-04-15T20:00:00Z"), tz)).toBe(false);
  });

  it("handles overnight window (wraps past midnight)", () => {
    const window: AgentTimeWindow = { start: "22:00", end: "06:00" };
    // 23:00 is inside
    expect(isInTimeWindow(window, d("2026-04-15T23:00:00Z"), tz)).toBe(true);
    // 03:00 is inside
    expect(isInTimeWindow(window, d("2026-04-15T03:00:00Z"), tz)).toBe(true);
    // 12:00 is outside
    expect(isInTimeWindow(window, d("2026-04-15T12:00:00Z"), tz)).toBe(false);
  });

  it("window start is inclusive", () => {
    const window: AgentTimeWindow = { start: "09:00", end: "18:00" };
    expect(isInTimeWindow(window, d("2026-04-15T09:00:00Z"), tz)).toBe(true);
  });

  it("window end is exclusive", () => {
    const window: AgentTimeWindow = { start: "09:00", end: "18:00" };
    expect(isInTimeWindow(window, d("2026-04-15T18:00:00Z"), tz)).toBe(false);
  });

  it("returns false when day filter excludes current day (Wednesday = wed)", () => {
    // Wednesday in UTC
    const window: AgentTimeWindow = { start: "09:00", end: "23:00", days: ["mon", "tue"] };
    expect(isInTimeWindow(window, WEDNESDAY_14_30_UTC, tz)).toBe(false);
  });

  it("returns true when day filter includes current day", () => {
    const window: AgentTimeWindow = { start: "09:00", end: "23:00", days: ["wed", "thu"] };
    expect(isInTimeWindow(window, WEDNESDAY_14_30_UTC, tz)).toBe(true);
  });

  it("only-start window: returns true if after start", () => {
    const window: AgentTimeWindow = { start: "09:00" };
    expect(isInTimeWindow(window, d("2026-04-15T10:00:00Z"), tz)).toBe(true);
    expect(isInTimeWindow(window, d("2026-04-15T08:00:00Z"), tz)).toBe(false);
  });
});

describe("msUntilWindowStart", () => {
  const tz = "UTC";

  it("returns ms until next occurrence when before window start", () => {
    const window: AgentTimeWindow = { start: "09:00" };
    // Current time: 08:00 UTC → 60 minutes until 09:00
    const ms = msUntilWindowStart(window, d("2026-04-15T08:00:00Z"), tz);
    expect(ms).toBe(60 * 60_000);
  });

  it("returns ~24h when already past window start today", () => {
    const window: AgentTimeWindow = { start: "09:00" };
    // Current time: 10:00 UTC → already past → next is tomorrow's 09:00 = 23h away
    const ms = msUntilWindowStart(window, d("2026-04-15T10:00:00Z"), tz);
    expect(ms).toBe(23 * 60 * 60_000);
  });

  it("returns positive value even for zero-minute difference (same minute)", () => {
    const window: AgentTimeWindow = { start: "09:00" };
    // Current time exactly at 09:00 → 24h
    const ms = msUntilWindowStart(window, d("2026-04-15T09:00:00Z"), tz);
    expect(ms).toBe(24 * 60 * 60_000);
  });
});

describe("computeReadingDelayMs", () => {
  it("returns 0 when no config", () => {
    expect(computeReadingDelayMs("hello world", undefined)).toBe(0);
  });

  it("returns minMs for empty message", () => {
    expect(computeReadingDelayMs("", { wpm: 200, minMs: 2000, maxMs: 20000 })).toBe(2000);
  });

  it("computes delay based on word count", () => {
    // 200 words at 200 wpm = 60_000 ms
    const text = Array(200).fill("word").join(" ");
    const ms = computeReadingDelayMs(text, { wpm: 200, minMs: 1000, maxMs: 120000 });
    expect(ms).toBe(60_000);
  });

  it("clamps to minMs", () => {
    // 1 word at 200 wpm = 300ms → clamps to minMs=2000
    const ms = computeReadingDelayMs("hi", { wpm: 200, minMs: 2000, maxMs: 20000 });
    expect(ms).toBe(2000);
  });

  it("clamps to maxMs", () => {
    // 1000 words at 200 wpm = 300_000 ms → clamps to maxMs=15000
    const text = Array(1000).fill("word").join(" ");
    const ms = computeReadingDelayMs(text, { wpm: 200, minMs: 1000, maxMs: 15000 });
    expect(ms).toBe(15000);
  });

  it("uses default wpm when not set", () => {
    // 200 words, default wpm=200 → 60_000ms; clamp to configured max
    const text = Array(200).fill("word").join(" ");
    const ms = computeReadingDelayMs(text, { minMs: 1000, maxMs: 120000 });
    expect(ms).toBe(60_000);
  });
});

describe("computeWritingDelayMs", () => {
  it("returns 0 when no config", () => {
    expect(computeWritingDelayMs("hello", undefined)).toBe(0);
  });

  it("returns 0 for empty string even when config is set", () => {
    expect(computeWritingDelayMs("", { wpm: 200, minMs: 1000, maxMs: 20_000 })).toBe(0);
  });

  it("uses 5 characters as one typing word", () => {
    // 5 chars → 1 word at 60 wpm = 1000ms raw
    expect(computeWritingDelayMs("hello", { wpm: 60, minMs: 500, maxMs: 20_000 })).toBe(1000);
  });

  it("ceil fractional words from character count", () => {
    // 6 chars → ceil(6/5)=2 words at 120 wpm = 1000ms raw
    expect(computeWritingDelayMs("abcdef", { wpm: 120, minMs: 100, maxMs: 20_000 })).toBe(1000);
  });

  it("clamps to minMs", () => {
    // 5 chars → 1 word at 200 wpm = 300ms → min 2000
    expect(computeWritingDelayMs("hello", { wpm: 200, minMs: 2000, maxMs: 20_000 })).toBe(2000);
  });

  it("clamps to maxMs", () => {
    const long = "a".repeat(5000);
    expect(computeWritingDelayMs(long, { wpm: 200, minMs: 1000, maxMs: 15_000 })).toBe(15_000);
  });

  it("uses default wpm when not set", () => {
    // 5000 chars → 1000 typing words, default wpm 200 → 300_000ms raw → clamp max 120_000
    const text = "a".repeat(5000);
    expect(computeWritingDelayMs(text, { minMs: 1000, maxMs: 120_000 })).toBe(120_000);
  });
});

describe("computeBusyDelayMs", () => {
  it("returns value within default range when no config", () => {
    const ms = computeBusyDelayMs(undefined);
    expect(ms).toBeGreaterThanOrEqual(60_000);
    expect(ms).toBeLessThanOrEqual(300_000);
  });

  it("returns min when max <= min", () => {
    const ms = computeBusyDelayMs({ minMs: 5000, maxMs: 5000 });
    expect(ms).toBe(5000);
  });

  it("returns value within custom range", () => {
    const ms = computeBusyDelayMs({ minMs: 10_000, maxMs: 20_000 });
    expect(ms).toBeGreaterThanOrEqual(10_000);
    expect(ms).toBeLessThanOrEqual(20_000);
  });
});

describe("normalizeInactiveWindows", () => {
  it("returns empty list for undefined", () => {
    expect(normalizeInactiveWindows(undefined)).toEqual([]);
  });

  it("returns empty list for unconstrained single object", () => {
    expect(normalizeInactiveWindows({})).toEqual([]);
  });

  it("wraps a single constrained window", () => {
    const w = { start: "22:00", end: "08:00" };
    expect(normalizeInactiveWindows(w)).toEqual([w]);
  });

  it("filters empty entries from an array", () => {
    expect(
      normalizeInactiveWindows([{}, { start: "09:00", end: "10:00" }, { days: ["mon"] as const }]),
    ).toEqual([{ start: "09:00", end: "10:00" }, { days: ["mon"] }]);
  });
});

describe("resolveAgentAvailabilityConfig", () => {
  const makeCfg = (
    defaults?: Record<string, unknown>,
    agentOverrides?: Record<string, unknown>,
  ): OpenClawConfig => {
    const cfg: Record<string, unknown> = {};
    if (defaults || agentOverrides) {
      cfg["agents"] = {
        defaults: defaults ? { availability: defaults } : undefined,
        list: agentOverrides ? [{ id: "test-agent", availability: agentOverrides }] : undefined,
      };
    }
    return cfg as unknown as OpenClawConfig;
  };

  it("returns undefined when no availability config set", () => {
    const result = resolveAgentAvailabilityConfig({} as OpenClawConfig, "test-agent");
    expect(result).toBeUndefined();
  });

  it("returns defaults when no per-agent override", () => {
    const cfg = makeCfg({ timezone: "UTC", offlineMode: "queue" });
    const result = resolveAgentAvailabilityConfig(cfg, "test-agent");
    expect(result?.timezone).toBe("UTC");
    expect(result?.offlineMode).toBe("queue");
  });

  it("per-agent timezone overrides defaults", () => {
    const cfg = makeCfg({ timezone: "UTC" }, { timezone: "Europe/Kyiv" });
    const result = resolveAgentAvailabilityConfig(cfg, "test-agent");
    expect(result?.timezone).toBe("Europe/Kyiv");
  });

  it("merges readingSpeed fields from defaults when per-agent has partial override", () => {
    const cfg = makeCfg(
      { readingSpeed: { wpm: 200, minMs: 1000, maxMs: 15000 } },
      { readingSpeed: { wpm: 150 } },
    );
    const result = resolveAgentAvailabilityConfig(cfg, "test-agent");
    // Per-agent readingSpeed replaces the whole sub-object (field-level merge only at top).
    expect(result?.readingSpeed?.wpm).toBe(150);
  });

  it("merges writingSpeed fields from defaults when per-agent has partial override", () => {
    const cfg = makeCfg(
      { writingSpeed: { wpm: 200, minMs: 1000, maxMs: 15000 } },
      { writingSpeed: { minMs: 2000 } },
    );
    const result = resolveAgentAvailabilityConfig(cfg, "test-agent");
    expect(result?.writingSpeed?.wpm).toBe(200);
    expect(result?.writingSpeed?.minMs).toBe(2000);
    expect(result?.writingSpeed?.maxMs).toBe(15000);
  });

  it("inherits busyWindows from defaults when agent has none", () => {
    const busyWindows = [{ start: "13:00", end: "16:00" }];
    const cfg = makeCfg({ busyWindows });
    const result = resolveAgentAvailabilityConfig(cfg, "test-agent");
    expect(result?.busyWindows).toEqual(busyWindows);
  });

  it("merges inactiveHours from defaults when agent has none", () => {
    const inactiveHours = { start: "22:00", end: "08:00" };
    const cfg = makeCfg({ inactiveHours });
    const result = resolveAgentAvailabilityConfig(cfg, "test-agent");
    expect(result?.inactiveHours).toEqual(inactiveHours);
  });
});

describe("hasAvailabilityWindow", () => {
  it("returns false for undefined or empty window", () => {
    expect(hasAvailabilityWindow(undefined)).toBe(false);
    expect(hasAvailabilityWindow({})).toBe(false);
  });

  it("returns true when start, end, or days are set", () => {
    expect(hasAvailabilityWindow({ start: "09:00" })).toBe(true);
    expect(hasAvailabilityWindow({ end: "18:00" })).toBe(true);
    expect(hasAvailabilityWindow({ days: ["sat"] })).toBe(true);
  });
});

describe("msUntilLeaveTimeWindow", () => {
  const tz = "UTC";

  it("returns 0 when outside the window", () => {
    const window: AgentTimeWindow = { start: "12:00", end: "13:00" };
    expect(msUntilLeaveTimeWindow(window, d("2026-04-15T11:00:00Z"), tz)).toBe(0);
  });

  it("returns ms until end for a same-day window", () => {
    const window: AgentTimeWindow = { start: "12:00", end: "13:00" };
    // 12:30 → 30 minutes
    expect(msUntilLeaveTimeWindow(window, d("2026-04-15T12:30:00Z"), tz)).toBe(30 * 60_000);
  });

  it("returns ms until morning end for overnight window when in evening segment", () => {
    const window: AgentTimeWindow = { start: "22:00", end: "08:00" };
    // Wed 23:00 UTC → Thu 08:00 = 9h
    expect(msUntilLeaveTimeWindow(window, d("2026-04-15T23:00:00Z"), tz)).toBe(9 * 60 * 60_000);
  });

  it("returns ms until end for overnight window when in morning segment", () => {
    const window: AgentTimeWindow = { start: "22:00", end: "08:00" };
    // Wed 03:00 → 08:00 = 5h
    expect(msUntilLeaveTimeWindow(window, d("2026-04-15T03:00:00Z"), tz)).toBe(5 * 60 * 60_000);
  });
});
