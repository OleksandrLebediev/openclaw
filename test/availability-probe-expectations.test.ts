import { describe, expect, it } from "vitest";
import {
  AVAILABILITY_PROBE_READING_MESSAGES,
  AVAILABILITY_PROBE_WRITING_ECHO_PROMPTS,
  availabilityWritingProbeInboundMessage,
} from "../scripts/dev/availability-probe/cases.js";
import { AVAILABILITY_READING_PRESETS } from "../scripts/dev/availability-probe/presets.js";
import { computeReadingDelayMs, computeWritingDelayMs } from "../src/agents/availability.js";

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

describe("availability-probe parametric expectations", () => {
  it("default preset: reading delay grows with inbound word count until maxMs clamp", () => {
    const preset = AVAILABILITY_READING_PRESETS.find((p) => p.id === "default");
    expect(preset).toBeTruthy();
    const cfg = preset!.readingSpeed;
    const delays = AVAILABILITY_PROBE_READING_MESSAGES.map((m) => ({
      id: m.idSuffix,
      words: wordCount(m.message),
      ms: computeReadingDelayMs(m.message, cfg),
    }));
    expect(delays[0]?.id).toBe("one-word");
    expect(delays[0].ms).toBe(2000);
    expect(delays[1].words).toBe(10);
    expect(delays[1].ms).toBe(3000);
    expect(delays[2].words).toBe(50);
    expect(delays[2].ms).toBe(15_000);
    expect(delays[3].words).toBe(100);
    expect(delays[3].ms).toBe(30_000);
    expect(delays[2].ms).toBeGreaterThanOrEqual(delays[1].ms);
  });

  it("default preset: writing delay grows with outbound char length (5-char typing words)", () => {
    const preset = AVAILABILITY_READING_PRESETS.find((p) => p.id === "default");
    const cfg = preset!.writingSpeed;
    const d50 = computeWritingDelayMs(AVAILABILITY_PROBE_WRITING_ECHO_PROMPTS[0].payload, cfg);
    const d400 = computeWritingDelayMs(AVAILABILITY_PROBE_WRITING_ECHO_PROMPTS[1].payload, cfg);
    expect(d50).toBe(15_000);
    expect(d400).toBe(60_000);
    expect(d400).toBeGreaterThan(d50);
  });

  it("slow-wpm preset: lower wpm increases delay for the same inbound text", () => {
    const text = "one two three four five six seven eight nine ten";
    const fast = AVAILABILITY_READING_PRESETS.find((p) => p.id === "default")!.readingSpeed;
    const slow = AVAILABILITY_READING_PRESETS.find((p) => p.id === "slow-wpm")!.readingSpeed;
    expect(computeReadingDelayMs(text, fast)).toBe(3000);
    expect(computeReadingDelayMs(text, slow)).toBe(15_000);
  });

  it("writing probe inbound has many words so reading delay is non-trivial vs echo-only body", () => {
    const preset = AVAILABILITY_READING_PRESETS.find((p) => p.id === "default")!;
    const inbound = availabilityWritingProbeInboundMessage("x".repeat(50));
    const readInbound = computeReadingDelayMs(inbound, preset.readingSpeed);
    const readEchoOnly = computeReadingDelayMs("x".repeat(50), preset.readingSpeed);
    expect(wordCount(inbound)).toBeGreaterThan(10);
    expect(readInbound).toBeGreaterThan(readEchoOnly);
  });
});
