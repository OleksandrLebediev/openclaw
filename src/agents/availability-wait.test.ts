import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";

const sleepMock = vi.hoisted(() => vi.fn((_ms: number) => Promise.resolve()));

vi.mock("../utils.js", () => ({
  sleep: (ms: number) => sleepMock(ms),
}));

import { applyAvailabilityWait } from "./availability-wait.js";

function makeCfg(availability: Record<string, unknown>): OpenClawConfig {
  return {
    agents: {
      defaults: { availability },
      list: [{ id: "busy-test-agent" }],
    },
  } as unknown as OpenClawConfig;
}

describe("applyAvailabilityWait busy windows", () => {
  beforeEach(() => {
    sleepMock.mockClear();
    vi.useFakeTimers({ toFake: ["Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sleeps for busyDelay when now falls inside a busy window (defers reply work)", async () => {
    // 14:30 UTC inside [13:00, 16:00)
    vi.setSystemTime(new Date("2026-06-15T14:30:00.000Z"));
    const cfg = makeCfg({
      timezone: "UTC",
      busyWindows: [{ start: "13:00", end: "16:00" }],
      busyDelay: { minMs: 42, maxMs: 42 },
    });

    await applyAvailabilityWait({
      cfg,
      agentId: "busy-test-agent",
      inboundText: "hello",
    });

    expect(sleepMock).toHaveBeenCalledTimes(1);
    expect(sleepMock).toHaveBeenCalledWith(42);
  });

  it("does not apply busy sleep when now is outside busy windows", async () => {
    // 12:00 UTC outside [13:00, 16:00)
    vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"));
    const cfg = makeCfg({
      timezone: "UTC",
      busyWindows: [{ start: "13:00", end: "16:00" }],
      busyDelay: { minMs: 99_000, maxMs: 99_000 },
    });

    await applyAvailabilityWait({
      cfg,
      agentId: "busy-test-agent",
      inboundText: "hello",
    });

    expect(sleepMock).not.toHaveBeenCalled();
  });

  it("applies busy sleep before reading delay when both are configured", async () => {
    vi.setSystemTime(new Date("2026-06-15T14:30:00.000Z"));
    const cfg = makeCfg({
      timezone: "UTC",
      busyWindows: [{ start: "13:00", end: "16:00" }],
      busyDelay: { minMs: 10, maxMs: 10 },
      readingSpeed: { wpm: 200, minMs: 1000, maxMs: 15_000 },
    });

    await applyAvailabilityWait({
      cfg,
      agentId: "busy-test-agent",
      inboundText: "one two",
    });

    expect(sleepMock).toHaveBeenCalledTimes(2);
    expect(sleepMock.mock.calls[0]?.[0]).toBe(10);
    // two words @ 200 wpm = 600ms, above minMs 1000 → 1000ms reading delay
    expect(sleepMock.mock.calls[1]?.[0]).toBe(1000);
  });

  it("sleeps until inactive window ends when inside inactiveHours and offlineMode queue", async () => {
    vi.setSystemTime(new Date("2026-06-15T23:00:00.000Z"));
    const cfg = makeCfg({
      timezone: "UTC",
      inactiveHours: { start: "22:00", end: "08:00" },
      offlineMode: "queue",
    });

    await applyAvailabilityWait({
      cfg,
      agentId: "busy-test-agent",
      inboundText: "hello",
    });

    expect(sleepMock).toHaveBeenCalledTimes(1);
    expect(sleepMock).toHaveBeenCalledWith(9 * 60 * 60 * 1000);
  });

  it("does not sleep for inactive schedule when offlineMode is immediate", async () => {
    vi.setSystemTime(new Date("2026-06-15T23:00:00.000Z"));
    const cfg = makeCfg({
      timezone: "UTC",
      inactiveHours: { start: "22:00", end: "08:00" },
      offlineMode: "immediate",
    });

    await applyAvailabilityWait({
      cfg,
      agentId: "busy-test-agent",
      inboundText: "hello",
    });

    expect(sleepMock).not.toHaveBeenCalled();
  });

  it("prefers inactiveHours over activeHours when both are set", async () => {
    vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"));
    const cfg = makeCfg({
      timezone: "UTC",
      inactiveHours: { start: "11:00", end: "13:00" },
      activeHours: { start: "09:00", end: "18:00" },
      offlineMode: "queue",
    });

    await applyAvailabilityWait({
      cfg,
      agentId: "busy-test-agent",
      inboundText: "hello",
    });

    expect(sleepMock).toHaveBeenCalledTimes(1);
    expect(sleepMock).toHaveBeenCalledWith(60 * 60_000);
  });

  it("sleeps until active window when outside activeHours and inactiveHours unset", async () => {
    vi.setSystemTime(new Date("2026-06-15T07:00:00.000Z"));
    const cfg = makeCfg({
      timezone: "UTC",
      activeHours: { start: "09:00", end: "18:00" },
      offlineMode: "queue",
    });

    await applyAvailabilityWait({
      cfg,
      agentId: "busy-test-agent",
      inboundText: "hello",
    });

    expect(sleepMock).toHaveBeenCalledTimes(1);
    expect(sleepMock).toHaveBeenCalledWith(2 * 60 * 60 * 1000);
  });
});
