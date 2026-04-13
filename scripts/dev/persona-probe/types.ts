// Shared types for the persona-probe eval framework.

/** A single tool call captured from the session JSONL. */
export type ToolCall = {
  name: string;
  args: unknown;
  result: string;
};

/** Full result captured for one probe turn. */
export type TurnResult = {
  probeId: string;
  /** The message sent to the agent. */
  message: string;
  /** Final text response from the agent. */
  response: string;
  /** Tool calls made during this turn. */
  toolCalls: ToolCall[];
  /** Whether bootstrap context was confirmed in the session JSONL. */
  bootstrapLoaded: boolean;
  /** Wall-clock duration of the agent call. */
  durationMs: number;
  /** Path of the session JSONL file on the remote host (for reference). */
  sessionFile: string;
};

export type CheckSeverity = "fail" | "warn";

/** A rule applied to a TurnResult. Six kinds are supported. */
export type Check =
  | {
      kind: "forbidden-phrase";
      /** String or regex; matched case-insensitively against `response`. */
      pattern: string | RegExp;
      severity?: CheckSeverity;
    }
  | {
      kind: "must-contain";
      pattern: string | RegExp;
      severity?: CheckSeverity;
    }
  | {
      kind: "tool-called";
      /** Exact tool name that must appear in toolCalls. */
      toolName: string;
      severity?: CheckSeverity;
    }
  | {
      kind: "tool-not-called";
      toolName: string;
      severity?: CheckSeverity;
    }
  | {
      kind: "no-tool-calls";
      severity?: CheckSeverity;
    }
  | {
      kind: "custom";
      id: string;
      description: string;
      severity?: CheckSeverity;
      test: (result: TurnResult) => boolean;
    };

/** Outcome of a single check. */
export type CheckResult = {
  check: Check;
  passed: boolean;
  /** Human-readable reason shown in the report. */
  reason: string;
};

/** Verdict for one probe case after all checks are applied. */
export type ProbeVerdict = "pass" | "warn" | "fail" | "error";

/** Full evaluation result for one probe case. */
export type ProbeResult = {
  probeId: string;
  group: string;
  /** Human-readable intent of the case (from `ProbeCase.description`). */
  description: string;
  message: string;
  verdict: ProbeVerdict;
  checkResults: CheckResult[];
  turn: TurnResult | null;
  /** Set when the agent call itself failed (SSH error, timeout, etc.). */
  error?: string;
};

/** One probe case definition. */
export type ProbeCase = {
  id: string;
  group: string;
  description: string;
  message: string;
  checks: Check[];
  /** Optional tags for filtering with --tags. */
  tags?: string[];
  /** Set true to skip without running. */
  skip?: boolean;
};

/** Baseline entry stored per probe across runs. */
export type BaselineEntry = {
  probeId: string;
  verdict: ProbeVerdict;
  runAt: string;
};

/** Full report for one run. */
export type ProbeReport = {
  runAt: string;
  agent: string;
  host: string;
  results: ProbeResult[];
  baseline: BaselineEntry[] | null;
  /** Optional harness label for reports (e.g. `availability-probe`). */
  harness?: string;
  /**
   * Optional Markdown-friendly prose (short paragraphs / bullets) explaining what this run
   * measured and how to read the report. Shown after the summary table in Markdown output.
   */
  runContext?: string;
};

/** CLI options passed to the runner. */
export type ProbeOptions = {
  agent: string;
  host: string;
  outputDir: string;
  tags: string[];
  group: string | null;
  noBaseline: boolean;
  writeJson: boolean;
};
