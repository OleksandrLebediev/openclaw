// Evaluate module: apply checks to a TurnResult and produce a ProbeResult.
import type {
  Check,
  CheckResult,
  ProbeCase,
  ProbeResult,
  ProbeVerdict,
  TurnResult,
} from "./types.js";

// ─── Pattern matching ─────────────────────────────────────────────────────────

function matchesPattern(text: string, pattern: string | RegExp): boolean {
  if (pattern instanceof RegExp) {
    return pattern.test(text);
  }
  return text.toLowerCase().includes(pattern.toLowerCase());
}

// ─── Check evaluation ─────────────────────────────────────────────────────────

function evaluateCheck(check: Check, turn: TurnResult): CheckResult {
  switch (check.kind) {
    case "forbidden-phrase": {
      const found = matchesPattern(turn.response, check.pattern);
      return {
        check,
        passed: !found,
        reason: found
          ? `Forbidden phrase matched: ${String(check.pattern)}`
          : `No forbidden phrase found`,
      };
    }

    case "must-contain": {
      const found = matchesPattern(turn.response, check.pattern);
      return {
        check,
        passed: found,
        reason: found
          ? `Required pattern found: ${String(check.pattern)}`
          : `Required pattern not found: ${String(check.pattern)}`,
      };
    }

    case "tool-called": {
      const called = turn.toolCalls.some((t) => t.name === check.toolName);
      return {
        check,
        passed: called,
        reason: called
          ? `Tool "${check.toolName}" was called`
          : `Tool "${check.toolName}" was NOT called`,
      };
    }

    case "tool-not-called": {
      const called = turn.toolCalls.some((t) => t.name === check.toolName);
      return {
        check,
        passed: !called,
        reason: !called
          ? `Tool "${check.toolName}" was correctly not called`
          : `Tool "${check.toolName}" was called but should not have been`,
      };
    }

    case "no-tool-calls": {
      const hasCalls = turn.toolCalls.length > 0;
      return {
        check,
        passed: !hasCalls,
        reason: !hasCalls
          ? "No tool calls (as expected)"
          : `${turn.toolCalls.length} tool call(s) made: ${turn.toolCalls.map((t) => t.name).join(", ")}`,
      };
    }

    case "custom": {
      let passed = false;
      let reason = check.description;
      try {
        passed = check.test(turn);
        reason = passed ? `${check.description} — passed` : `${check.description} — failed`;
      } catch (err) {
        reason = `Custom check threw: ${err instanceof Error ? err.message : String(err)}`;
      }
      return { check, passed, reason };
    }
  }
}

// ─── Verdict resolution ───────────────────────────────────────────────────────

function resolveVerdict(checkResults: CheckResult[]): ProbeVerdict {
  const failed = checkResults.filter((r) => !r.passed);
  if (failed.length === 0) {
    return "pass";
  }

  const hasFail = failed.some((r) => (r.check.severity ?? "fail") === "fail");
  return hasFail ? "fail" : "warn";
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function evaluateProbe(
  probeCase: ProbeCase,
  turn: TurnResult | null,
  error?: string,
): ProbeResult {
  if (error !== undefined || turn === null) {
    return {
      probeId: probeCase.id,
      group: probeCase.group,
      message: probeCase.message,
      verdict: "error",
      checkResults: [],
      turn: null,
      error,
    };
  }

  const checkResults = probeCase.checks.map((check) => evaluateCheck(check, turn));
  const verdict = resolveVerdict(checkResults);

  return {
    probeId: probeCase.id,
    group: probeCase.group,
    message: probeCase.message,
    verdict,
    checkResults,
    turn,
  };
}
