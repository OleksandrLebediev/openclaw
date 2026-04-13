// Availability probe cases: wall-clock checks against `openclaw agent` on a remote host.
//
// For `derivedFromReadingSpeed`, keep the same numbers as
// `agents.defaults.availability.readingSpeed` / per-agent override on the server,
// otherwise duration vs. reading-delay checks will not reflect reality.
import { computeReadingDelayMs } from "../../../src/agents/availability.js";
import type { Check, ProbeCase } from "../persona-probe/types.js";
import type { AvailabilityCase } from "./types.js";

export const AVAILABILITY_CASES: AvailabilityCase[] = [
  {
    id: "reading-one-word",
    group: "reading",
    description:
      "Single-word message — reading delay hits minMs at default wpm (match server readingSpeed).",
    message: "Hi",
    derivedFromReadingSpeed: { wpm: 200, minMs: 1000, maxMs: 15_000 },
    slackMs: 3500,
    modelHeadroomMs: 120_000,
    durationSeverity: "warn",
  },
  {
    id: "reading-ten-words",
    group: "reading",
    description:
      "Ten words — delay scales with word count at 200 wpm (adjust if server wpm differs).",
    message: "one two three four five six seven eight nine ten",
    derivedFromReadingSpeed: { wpm: 200, minMs: 1000, maxMs: 15_000 },
    slackMs: 3500,
    modelHeadroomMs: 120_000,
    durationSeverity: "warn",
  },
  {
    id: "sanity-not-hung",
    group: "sanity",
    description: "Full round-trip completes within 5 minutes (fail if gateway/agent stuck).",
    message: "ping",
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
    minDurationMs: 0,
  },
];

function availabilityCaseToProbeCase(c: AvailabilityCase): ProbeCase {
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

  if (c.derivedFromReadingSpeed) {
    const expectedReadMs = computeReadingDelayMs(c.message, c.derivedFromReadingSpeed);
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
export function availabilityCasesToProbeCases(): ProbeCase[] {
  return AVAILABILITY_CASES.filter((c) => !c.skip).map(availabilityCaseToProbeCase);
}
