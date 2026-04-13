import type { ReadingSpeedExpect } from "./types.js";

export type AvailabilityReadingPresetId = "default" | "high-min" | "slow-wpm" | "tight-cap";

export type AvailabilityReadingPreset = {
  id: AvailabilityReadingPresetId;
  label: string;
  /** Expected gateway `agents.*.availability.readingSpeed` (subset). */
  readingSpeed: ReadingSpeedExpect;
  /** Extra slack for probe evaluation (network + gateway jitter). */
  slackMs: number;
};

export const AVAILABILITY_READING_PRESETS: readonly AvailabilityReadingPreset[] = [
  {
    id: "default",
    label: "Default-like (200 wpm, 1s min, 15s cap)",
    readingSpeed: { wpm: 200, minMs: 1000, maxMs: 15_000 },
    slackMs: 3500,
  },
  {
    id: "high-min",
    label: "High minimum delay (5s floor)",
    readingSpeed: { wpm: 200, minMs: 5000, maxMs: 60_000 },
    slackMs: 4000,
  },
  {
    id: "slow-wpm",
    label: "Slow reading (40 wpm, long cap)",
    readingSpeed: { wpm: 40, minMs: 500, maxMs: 120_000 },
    slackMs: 5000,
  },
  {
    id: "tight-cap",
    label: "Tight max delay (2.5s cap)",
    readingSpeed: { wpm: 200, minMs: 400, maxMs: 2500 },
    slackMs: 3500,
  },
] as const;

export function getReadingPreset(id: string): AvailabilityReadingPreset | undefined {
  return AVAILABILITY_READING_PRESETS.find((p) => p.id === id);
}

export function listReadingPresetsText(): string {
  const lines = [
    "Reading presets (set gateway `agents.*.availability.readingSpeed` to match before running):",
    "",
  ];
  for (const p of AVAILABILITY_READING_PRESETS) {
    lines.push(`  ${p.id}`);
    lines.push(`    ${p.label}`);
    lines.push(`    JSON: ${JSON.stringify(p.readingSpeed)}`);
    lines.push("");
  }
  lines.push("Run: pnpm availability:probe -- --preset <id> ...");
  return lines.join("\n");
}
