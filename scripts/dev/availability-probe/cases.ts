// Availability probe cases: wall-clock checks against `openclaw agent` on a remote host.
//
// Reading cases scale with **inbound** message length (see `READING_MESSAGES`). Writing cases
// ask for a deterministic echo so **outbound** `computeWritingDelayMs(response, …)` applies
// at evaluation time (combined with reading delay on the same inbound message when set).
//
// Optional `--reading-speed` / `--writing-speed` JSON merges onto each case’s expectations.
import { computeReadingDelayMs, computeWritingDelayMs } from "../../../src/agents/availability.js";
import type { Check, ProbeCase } from "../persona-probe/types.js";
import { AVAILABILITY_READING_PRESETS } from "./presets.js";
import type { AvailabilityCase, ReadingSpeedExpect } from "./types.js";

/** Inbound texts for reading-delay probes (exported for `--print-expectations` and unit tests). */
export const AVAILABILITY_PROBE_READING_MESSAGES = [
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
  {
    idSuffix: "fifty-words",
    message: Array(50).fill("w").join(" "),
    blurb: "Fifty tokens — larger inbound reading delay than the ten-word case.",
  },
  {
    idSuffix: "hundred-words",
    message: Array(100).fill("w").join(" "),
    blurb: "Hundred tokens — scales reading delay further (may clamp at maxMs).",
  },
] as const;

/** Echo payloads for writing-delay probes (same rows as `buildWritingCases`). */
export const AVAILABILITY_PROBE_WRITING_ECHO_PROMPTS = [
  {
    idSuffix: "out-50",
    payload: "x".repeat(50),
    minResponseChars: 40,
    blurb:
      "Echo 50 ASCII letters — writing-delay floor from assistant text length (typing-test words).",
  },
  {
    idSuffix: "out-400",
    payload: "z".repeat(400),
    minResponseChars: 320,
    blurb: "Echo 400 ASCII letters — larger outbound writing delay vs the 50-char case.",
  },
] as const;

/** Same inbound template as SSH writing probes (deterministic echo instructions). */
export function availabilityWritingProbeInboundMessage(payload: string): string {
  return (
    "Reply with exactly the following line and nothing else " +
    "(no quotes, no markdown fences, no explanation):\n" +
    payload
  );
}

function readingCaseId(presetId: string, idSuffix: string): string {
  if (presetId === "default" && idSuffix === "one-word") {
    return "reading-one-word";
  }
  if (presetId === "default" && idSuffix === "ten-words") {
    return "reading-ten-words";
  }
  return `read-${presetId}-${idSuffix}`;
}

function buildReadingCases(): AvailabilityCase[] {
  const out: AvailabilityCase[] = [];
  for (const p of AVAILABILITY_READING_PRESETS) {
    for (const m of AVAILABILITY_PROBE_READING_MESSAGES) {
      const id = readingCaseId(p.id, m.idSuffix);
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

function buildWritingCases(): AvailabilityCase[] {
  const out: AvailabilityCase[] = [];
  for (const p of AVAILABILITY_READING_PRESETS) {
    for (const m of AVAILABILITY_PROBE_WRITING_ECHO_PROMPTS) {
      const message = availabilityWritingProbeInboundMessage(m.payload);
      out.push({
        id: `write-${p.id}-${m.idSuffix}`,
        group: "writing",
        preset: p.id,
        tags: ["writing", `preset:${p.id}`],
        description: `${m.blurb} [preset: ${p.id}]`,
        message,
        minResponseChars: m.minResponseChars,
        derivedFromReadingSpeed: { ...p.readingSpeed },
        derivedFromWritingSpeed: { ...p.writingSpeed },
        slackMs: p.slackMs,
        modelHeadroomMs: 240_000,
        durationSeverity: "warn",
      });
    }
  }
  return out;
}

function buildAvailabilityCases(): AvailabilityCase[] {
  return [
    ...buildReadingCases(),
    ...buildWritingCases(),
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
        "Outside active hours or inside inactiveHours with offlineMode queue — would sleep until available (not run in CI).",
      message: "Should not run automatically",
      skip: true,
      tags: ["offline"],
      minDurationMs: 0,
    },
  ];
}

/** All cases (including `skip: true` placeholders). */
export const AVAILABILITY_CASES: AvailabilityCase[] = buildAvailabilityCases();

function mergeSpeed(
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
  mergeWritingSpeed?: ReadingSpeedExpect,
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

  if (typeof c.minResponseChars === "number" && c.minResponseChars > 0) {
    checks.push({
      kind: "custom",
      id: "response-min-length",
      description: `Assistant reply is at least ${c.minResponseChars} characters (echo probe)`,
      severity: "warn",
      test: (t) => t.response.trim().length >= c.minResponseChars!,
    });
  }

  const slack = c.slackMs ?? 2500;
  const modelHeadroom = c.modelHeadroomMs ?? 180_000;
  const sev = c.durationSeverity ?? "warn";

  const mergedRead = mergeSpeed(c.derivedFromReadingSpeed, mergeReadingSpeed);
  const mergedWrite = mergeSpeed(c.derivedFromWritingSpeed, mergeWritingSpeed);

  if (mergedRead && !mergedWrite) {
    const expectedReadMs = computeReadingDelayMs(c.message, mergedRead);
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
  } else if (mergedWrite) {
    checks.push({
      kind: "custom",
      id: "duration-vs-read-plus-writing-floor",
      description:
        `durationMs >= read(inbound)+write(response)−${slack}ms ` +
        `(typing-test words for write; CLI path may omit channel delays — WARN if model-only)`,
      severity: sev,
      test: (t) => {
        const readMs = mergedRead ? computeReadingDelayMs(t.message, mergedRead) : 0;
        const writeMs = computeWritingDelayMs(t.response.trim(), mergedWrite);
        const floor = Math.max(0, readMs + writeMs - slack);
        return t.durationMs >= floor;
      },
    });
    checks.push({
      kind: "custom",
      id: "duration-sane-upper-read-write",
      description: `durationMs <= read+write+${Math.round(modelHeadroom / 1000)}s headroom`,
      severity: "warn",
      test: (t) => {
        const readMs = mergedRead ? computeReadingDelayMs(t.message, mergedRead) : 0;
        const writeMs = computeWritingDelayMs(t.response.trim(), mergedWrite);
        const ceiling = readMs + writeMs + modelHeadroom;
        return t.durationMs <= ceiling;
      },
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
export function availabilityCasesToProbeCases(
  mergeReadingSpeed?: ReadingSpeedExpect,
  mergeWritingSpeed?: ReadingSpeedExpect,
): ProbeCase[] {
  return AVAILABILITY_CASES.filter((c) => !c.skip).map((c) =>
    availabilityCaseToProbeCase(c, mergeReadingSpeed, mergeWritingSpeed),
  );
}
