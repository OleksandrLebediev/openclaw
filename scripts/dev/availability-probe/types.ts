// Types for availability-probe (response-schedule / reading-delay smoke on a remote host).

import type { Check, ProbeCase } from "../persona-probe/types.js";

/** Same shape as config `agents.*.availability.readingSpeed` / `writingSpeed` (subset). */
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
   * Reading-delay cases are tied to a named preset (see `presets.ts`).
   * Cases without `preset` (for example sanity) are not filtered by `--preset`.
   */
  preset?: string;

  /**
   * When set, expects `durationMs >= computeReadingDelayMs(message, cfg) - slackMs`
   * (and optional upper bound). **Must match** `agents.*.availability.readingSpeed` on the
   * remote gateway or checks will be meaningless.
   */
  derivedFromReadingSpeed?: ReadingSpeedExpect;
  /**
   * When set, adds a lower bound from `computeWritingDelayMs(response.trim(), cfg)` using the
   * **assistant text** returned by the probe (evaluated at check time). Align with
   * `agents.*.availability.writingSpeed` on the host when that delay is on the measured path
   * (for example channel auto-reply); `openclaw agent` CLI often does **not** include outbound
   * writing delay, so combined checks may WARN even when the gateway is correct for DMs.
   */
  derivedFromWritingSpeed?: ReadingSpeedExpect;
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

  /** For writing probes: minimum trimmed response length (echo fidelity). */
  minResponseChars?: number;
};

export type AvailabilityProbeOptions = {
  agent: string;
  host: string;
  outputDir: string;
  tags: string[];
  group: string | null;
  /**
   * Which reading preset to run (`default` matches typical server config).
   * Use `all` to run every preset’s reading cases (server must match each block, or expect noise).
   */
  preset: string;
  /** Merged over each case’s `derivedFromReadingSpeed` for evaluation (CLI wins per field). */
  readingSpeedMerge: ReadingSpeedExpect | null;
  /** Merged over each case’s `derivedFromWritingSpeed` for evaluation (CLI wins per field). */
  writingSpeedMerge: ReadingSpeedExpect | null;
  noBaseline: boolean;
  writeJson: boolean;
};

export type { Check, ProbeCase };
