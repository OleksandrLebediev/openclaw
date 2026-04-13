// Types for availability-probe (response-schedule / reading-delay smoke on a remote host).

import type { Check, ProbeCase } from "../persona-probe/types.js";

/** Same shape as config `agents.*.availability.readingSpeed` (subset). */
export type ReadingSpeedExpect = {
  wpm?: number;
  minMs?: number;
  maxMs?: number;
};

/** One probe: send `message` via SSH `openclaw agent`, then check wall `durationMs`. */
export type AvailabilityCase = {
  id: string;
  group: string;
  description: string;
  message: string;
  skip?: boolean;
  tags?: string[];

  /**
   * When set, expects `durationMs >= computeReadingDelayMs(message, cfg) - slackMs`
   * (and optional upper bound). **Must match** `agents.*.availability.readingSpeed` on the
   * remote gateway or checks will be meaningless.
   */
  derivedFromReadingSpeed?: ReadingSpeedExpect;
  /** Subtracted from derived reading delay for the lower bound (default 2500). */
  slackMs?: number;
  /** Added to derived reading delay for the soft upper bound (default 180_000). */
  modelHeadroomMs?: number;

  /** Explicit lower bound on `durationMs` (wall clock for full `openclaw agent` call). */
  minDurationMs?: number;
  /** Explicit upper bound on `durationMs`. */
  maxDurationMs?: number;

  /** Severity for duration-related checks (default `warn` — LLM latency is noisy). */
  durationSeverity?: "fail" | "warn";
};

export type AvailabilityProbeOptions = {
  agent: string;
  host: string;
  outputDir: string;
  tags: string[];
  group: string | null;
  noBaseline: boolean;
  writeJson: boolean;
};

export type { Check, ProbeCase };
