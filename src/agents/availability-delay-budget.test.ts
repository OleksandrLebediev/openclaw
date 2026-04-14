/**
 * Availability delay “budget” — maps config parameters to planned delays and to the
 * **order of sleeps** inside `applyAvailabilityWait`.
 *
 * ## Inbound (before the model runs)
 *
 * `applyAvailabilityWait` runs in this order (see `src/agents/availability-wait.ts`):
 *
 * 1. **Schedule** — if `offlineMode !== "immediate"`:
 *    - `inactiveHours` (one window or array): while `now` is inside any listed window →
 *      repeated `sleep(msUntilLeave)` until outside all of them.
 *    - else `activeHours`: if `now` is outside the window → one `sleep(msUntilWindowStart)`.
 * 2. **Busy** — if any `busyWindows` matches `now` → one `sleep(computeBusyDelayMs(busyDelay))`
 *    (random between min/max unless `max <= min`).
 * 3. **Reading** — if `readingSpeed` is set → one `sleep(computeReadingDelayMs(inboundText, readingSpeed))`.
 * 4. **Random** — if `randomDelay` sets at least one bound → one `sleep(computeRandomDelayMs(randomDelay))`.
 *
 * When `diagnostics.enabled`, `dispatch-from-config` emits **`reply.availability_timing` /
 * `kind: "inbound_wait"`** with **`waitMs` = wall-clock** for the whole `applyAvailabilityWait`
 * call (sum of the sleeps above), not split by stage.
 *
 * ## Outbound (before final text is sent)
 *
 * Handled in `sendFinalPayload` in `dispatch-from-config.ts`: **`computeWritingDelayMs`**
 * on trimmed outbound text (typing-test words = ceil(chars / 5)), then clamped by
 * `writingSpeed` min/max. Diagnostics: **`kind: "outbound_writing"`** with `plannedMs`,
 * `waitedMs`, `skipped`, `skipReason` (see `DiagnosticReplyAvailabilityTimingEvent`).
 *
 * ## Remote wall-clock checks
 *
 * `pnpm availability:probe` + `--print-expectations` compares SSH round-trip to the same
 * helpers (`docs/help/remote-probes.md`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { applyAvailabilityWait } from "./availability-wait.js";
import {
  computeBusyDelayMs,
  computeRandomDelayMs,
  computeReadingDelayMs,
  computeWritingDelayMs,
} from "./availability.js";

const sleepMock = vi.hoisted(() =>
  vi.fn(async (ms: number) => {
    await vi.advanceTimersByTimeAsync(ms);
  }),
);

vi.mock("../utils.js", () => ({
  sleep: (ms: number) => sleepMock(ms),
}));

function cfgWithAvailability(availability: Record<string, unknown>): OpenClawConfig {
  return {
    agents: {
      defaults: { availability },
      list: [{ id: "delay-budget-agent" }],
    },
  } as unknown as OpenClawConfig;
}

describe("availability delay budget — reading parameters → planned ms", () => {
  const rows: Array<{
    label: string;
    text: string;
    speed: { wpm?: number; minMs?: number; maxMs?: number };
    expectedMs: number;
  }> = [
    {
      label: "one word, human-like defaults (implicit min/max/wpm)",
      text: "Hi",
      speed: {},
      expectedMs: 2000,
    },
    {
      label: "ten words @ 200 wpm",
      text: "one two three four five six seven eight nine ten",
      speed: { wpm: 200, minMs: 2000, maxMs: 30_000 },
      expectedMs: 3000,
    },
    {
      label: "fifty single-char “words” hits max clamp",
      text: Array(50).fill("w").join(" "),
      speed: { wpm: 200, minMs: 2000, maxMs: 30_000 },
      expectedMs: 15_000,
    },
    {
      label: "empty inbound uses minMs only",
      text: "   \n\t  ",
      speed: { wpm: 200, minMs: 2000, maxMs: 30_000 },
      expectedMs: 2000,
    },
  ];

  it.each(rows)("$label", ({ text, speed, expectedMs }) => {
    expect(computeReadingDelayMs(text, speed)).toBe(expectedMs);
  });
});

describe("availability delay budget — writing parameters → planned ms", () => {
  const rows: Array<{
    label: string;
    text: string;
    speed: { wpm?: number; minMs?: number; maxMs?: number };
    expectedMs: number;
  }> = [
    {
      label: "50 chars → 10 typing words @ 40 wpm",
      text: "x".repeat(50),
      speed: { wpm: 40, minMs: 1500, maxMs: 60_000 },
      expectedMs: 15_000,
    },
    {
      label: "400 chars → 80 typing words @ 40 wpm, capped at maxMs",
      text: "z".repeat(400),
      speed: { wpm: 40, minMs: 1500, maxMs: 60_000 },
      expectedMs: 60_000,
    },
    {
      label: "5 chars = 1 word, below min → minMs",
      text: "hello",
      speed: { wpm: 40, minMs: 1500, maxMs: 60_000 },
      expectedMs: 1500,
    },
    {
      label: "empty outbound → 0 (caller skips sleep)",
      text: "",
      speed: { wpm: 40, minMs: 1500, maxMs: 60_000 },
      expectedMs: 0,
    },
    {
      label: "implicit defaults on partial writingSpeed object",
      text: "x".repeat(50),
      speed: {},
      expectedMs: 15_000,
    },
  ];

  it.each(rows)("$label", ({ text, speed, expectedMs }) => {
    expect(computeWritingDelayMs(text, speed)).toBe(expectedMs);
  });
});

describe("availability delay budget — randomDelay range (deterministic)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses min..max inclusive when max > min (mock Math.random)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const minMs = 10;
    const maxMs = 20;
    const span = maxMs - minMs + 1;
    const expected = minMs + Math.floor(0.5 * span);
    expect(computeRandomDelayMs({ minMs, maxMs })).toBe(expected);
  });
});

describe("availability delay budget — busyDelay random range (deterministic)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses min..max inclusive when max > min (mock Math.random)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const minMs = 100;
    const maxMs = 200;
    const span = maxMs - minMs + 1;
    const expected = minMs + Math.floor(0.5 * span);
    expect(computeBusyDelayMs({ minMs, maxMs })).toBe(expected);
    expect(computeBusyDelayMs({ minMs, maxMs })).toBeGreaterThanOrEqual(minMs);
    expect(computeBusyDelayMs({ minMs, maxMs })).toBeLessThanOrEqual(maxMs);
  });

  it("returns min when max <= min", () => {
    expect(computeBusyDelayMs({ minMs: 42, maxMs: 42 })).toBe(42);
  });
});

describe("availability delay budget — applyAvailabilityWait sleep sequence", () => {
  beforeEach(() => {
    sleepMock.mockClear();
    vi.useFakeTimers({ toFake: ["Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("no availability config → no sleeps", async () => {
    await applyAvailabilityWait({
      cfg: {} as OpenClawConfig,
      agentId: "delay-budget-agent",
      inboundText: "hello",
    });
    expect(sleepMock).not.toHaveBeenCalled();
  });

  it("reading only → one sleep equal to computeReadingDelayMs", async () => {
    vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"));
    const inbound = "one two";
    const readingSpeed = { wpm: 200, minMs: 2000, maxMs: 30_000 };
    const plannedRead = computeReadingDelayMs(inbound, readingSpeed);

    await applyAvailabilityWait({
      cfg: cfgWithAvailability({ timezone: "UTC", readingSpeed }),
      agentId: "delay-budget-agent",
      inboundText: inbound,
    });

    expect(sleepMock).toHaveBeenCalledTimes(1);
    expect(sleepMock.mock.calls[0]?.[0]).toBe(plannedRead);
  });

  it("busy window + reading + randomDelay → three sleeps in order", async () => {
    vi.setSystemTime(new Date("2026-06-15T14:30:00.000Z"));
    const inbound = "one two";
    const readingSpeed = { wpm: 200, minMs: 2000, maxMs: 30_000 };
    const plannedRead = computeReadingDelayMs(inbound, readingSpeed);
    const busyMs = 10;
    const jitterMs = 5;

    await applyAvailabilityWait({
      cfg: cfgWithAvailability({
        timezone: "UTC",
        busyWindows: [{ start: "13:00", end: "16:00" }],
        busyDelay: { minMs: busyMs, maxMs: busyMs },
        readingSpeed,
        randomDelay: { minMs: jitterMs, maxMs: jitterMs },
      }),
      agentId: "delay-budget-agent",
      inboundText: inbound,
    });

    expect(sleepMock).toHaveBeenCalledTimes(3);
    expect(sleepMock.mock.calls[0]?.[0]).toBe(busyMs);
    expect(sleepMock.mock.calls[1]?.[0]).toBe(plannedRead);
    expect(sleepMock.mock.calls[2]?.[0]).toBe(jitterMs);
    const inboundWallBudget =
      Number(sleepMock.mock.calls[0]?.[0] ?? 0) +
      Number(sleepMock.mock.calls[1]?.[0] ?? 0) +
      Number(sleepMock.mock.calls[2]?.[0] ?? 0);
    expect(inboundWallBudget).toBe(busyMs + plannedRead + jitterMs);
  });

  it("inactive queue wait then reading (two sleeps)", async () => {
    vi.setSystemTime(new Date("2026-06-15T23:00:00.000Z"));
    const inbound = "hi";
    const readingSpeed = { wpm: 200, minMs: 2000, maxMs: 30_000 };
    const plannedRead = computeReadingDelayMs(inbound, readingSpeed);
    // 23:00 UTC inside inactive 22:00–08:00 → sleep until 08:00 next day = 9h
    const scheduleMs = 9 * 60 * 60 * 1000;

    await applyAvailabilityWait({
      cfg: cfgWithAvailability({
        timezone: "UTC",
        inactiveHours: { start: "22:00", end: "08:00" },
        offlineMode: "queue",
        readingSpeed,
      }),
      agentId: "delay-budget-agent",
      inboundText: inbound,
    });

    expect(sleepMock).toHaveBeenCalledTimes(2);
    expect(sleepMock.mock.calls[0]?.[0]).toBe(scheduleMs);
    expect(sleepMock.mock.calls[1]?.[0]).toBe(plannedRead);
  });
});
