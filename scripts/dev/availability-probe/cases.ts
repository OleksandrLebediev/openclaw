// Availability probe cases: wall-clock checks against `openclaw agent` on a remote host.
//
// Reading cases are generated per named preset (`presets.ts`). Use `--preset <id>` so the
// probe only runs cases that match the gateway’s `agents.*.availability.readingSpeed`.
//
// Optional `--reading-speed '<json>'` merges on top of each case’s expected readingSpeed
// (useful when the server differs slightly from a preset without editing this file).
import { computeReadingDelayMs } from "../../../src/agents/availability.js";
import type { Check, ProbeCase } from "../persona-probe/types.js";
import { AVAILABILITY_READING_PRESETS } from "./presets.js";
import type { AvailabilityCase, ReadingSpeedExpect } from "./types.js";

const READING_MESSAGES = [
  {
    idSuffix: "one-word",
    message: "Hi",
    blurb:
      "Single-word message — reading delay hits minMs at this wpm (match server readingSpeed).",
  },
  {
    idSuffix: "ten-words",
    message: "one two three four five six seven eight nine ten",
    blurb: "Ten words — delay scales with word count (match server wpm/min/max).",
  },
] as const;

function buildReadingCases(): AvailabilityCase[] {
  const out: AvailabilityCase[] = [];
  for (const p of AVAILABILITY_READING_PRESETS) {
    for (const m of READING_MESSAGES) {
      const id =
        p.id === "default"
          ? m.idSuffix === "one-word"
            ? "reading-one-word"
            : "reading-ten-words"
          : `read-${p.id}-${m.idSuffix}`;

      out.push({
        id,
        group: "reading",
        preset: p.id,
        tags: ["reading", `preset:${p.id}`],
        description: `${m.blurb} [preset: ${p.id}]`,
        message: m.message,
        derivedFromReadingSpeed: { ...p.readingSpeed },
        slackMs: p.slackMs,
        modelHeadroomMs: 120_000,
        durationSeverity: "warn",
      });
    }
  }
  return out;
}

function buildAvailabilityCases(): AvailabilityCase[] {
  return [
    ...buildReadingCases(),
    {
      id: "sanity-not-hung",
      group: "sanity",
      description: "Full round-trip completes within 5 minutes (fail if gateway/agent stuck).",
      message: "ping",
      tags: ["sanity"],
      maxDurationMs: 300_000,
      durationSeverity: "fail",
    },
    {
      id: "offline-queue-waits-hours",
      group: "offline",
      description:
        "Outside activeHours with offlineMode queue — would sleep until next window (not run in CI).",
      message: "Should not run automatically",
      skip: true,
      tags: ["offline"],
      minDurationMs: 0,
    },
  ];
}

/** All cases (including `skip: true` placeholders). */
export const AVAILABILITY_CASES: AvailabilityCase[] = buildAvailabilityCases();

function mergeReading(
  base?: ReadingSpeedExpect,
  over?: ReadingSpeedExpect,
): ReadingSpeedExpect | undefined {
  if (!base && !over) {
    return undefined;
  }
  return { ...base, ...over };
}

function availabilityCaseToProbeCase(
  c: AvailabilityCase,
  mergeReadingSpeed?: ReadingSpeedExpect,
): ProbeCase {
  const checks: Check[] = [
    {
      kind: "custom",
      id: "response-non-empty",
      description: "Agent returned a non-empty reply",
      severity: "fail",
      test: (t) => t.response.trim().length > 0,
    },
  ];

  const slack = c.slackMs ?? 2500;
  const modelHeadroom = c.modelHeadroomMs ?? 180_000;
  const sev = c.durationSeverity ?? "warn";

  const derivedCfg = mergeReading(c.derivedFromReadingSpeed, mergeReadingSpeed);

  if (derivedCfg) {
    const expectedReadMs = computeReadingDelayMs(c.message, derivedCfg);
    const floor = Math.max(0, expectedReadMs - slack);
    const ceiling = expectedReadMs + modelHeadroom;
    checks.push({
      kind: "custom",
      id: "duration-vs-reading-delay",
      description: `durationMs >= ${floor} (reading delay ~${expectedReadMs}ms, −${slack}ms slack)`,
      severity: sev,
      test: (t) => t.durationMs >= floor,
    });
    checks.push({
      kind: "custom",
      id: "duration-sane-upper",
      description: `durationMs <= ${ceiling} (reading delay + ${Math.round(modelHeadroom / 1000)}s headroom)`,
      severity: "warn",
      test: (t) => t.durationMs <= ceiling,
    });
  } else {
    if (c.minDurationMs != null) {
      checks.push({
        kind: "custom",
        id: "min-duration",
        description: `durationMs >= ${c.minDurationMs}`,
        severity: sev,
        test: (t) => t.durationMs >= c.minDurationMs!,
      });
    }
    if (c.maxDurationMs != null) {
      checks.push({
        kind: "custom",
        id: "max-duration",
        description: `durationMs <= ${c.maxDurationMs}`,
        severity: sev,
        test: (t) => t.durationMs <= c.maxDurationMs!,
      });
    }
  }

  return {
    id: c.id,
    group: c.group,
    description: c.description,
    message: c.message,
    checks,
    tags: c.tags,
  };
}

/** Convert availability cases to persona-probe `ProbeCase` for shared `evaluateProbe`. */
export function availabilityCasesToProbeCases(mergeReadingSpeed?: ReadingSpeedExpect): ProbeCase[] {
  return AVAILABILITY_CASES.filter((c) => !c.skip).map((c) =>
    availabilityCaseToProbeCase(c, mergeReadingSpeed),
  );
}
