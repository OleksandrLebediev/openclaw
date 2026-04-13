#!/usr/bin/env bun
/**
 * availability-probe — smoke-test agent availability (reading delay, wall time) on a remote host.
 *
 * Reuses persona-probe capture (SSH → `openclaw agent --json`) and evaluates **wall-clock**
 * `durationMs` against expected reading delay from the same `computeReadingDelayMs` helper as
 * the gateway (see `src/agents/availability.ts`).
 *
 * **Important:** For `derivedFromReadingSpeed` cases in `cases.ts`, keep numbers aligned with
 * `agents.defaults.availability.readingSpeed` / `agents.list[].availability.readingSpeed` on the
 * server. Active-hours / busy-window waits are not auto-verified here (too environment-dependent);
 * use explicit `minDurationMs` / `maxDurationMs` if you script a fixed test window.
 *
 * Usage:
 *   pnpm availability:probe -- [options]
 *   # or: node --import tsx scripts/dev/availability-probe.ts [options]
 *
 *   --agent   <id>      Agent ID (default: AVAILABILITY_PROBE_AGENT or PERSONA_PROBE_AGENT)
 *   --host    <alias>   SSH host (default: AVAILABILITY_PROBE_HOST or PERSONA_PROBE_HOST or "claw")
 *   --output  <dir>     Artifacts (default: .artifacts/availability-probe)
 *   --group   <name>    Run one group: reading | sanity | offline
 *   --tags    <a,b>     Comma-separated tags
 *   --no-baseline       Skip baseline diff/update
 *   --json              Also write JSON report
 */
import path from "node:path";
import { availabilityCasesToProbeCases, AVAILABILITY_CASES } from "./availability-probe/cases.js";
import type { AvailabilityProbeOptions } from "./availability-probe/types.js";
import { captureProbe } from "./persona-probe/capture.js";
import { evaluateProbe } from "./persona-probe/evaluate.js";
import { loadBaseline, writeReports } from "./persona-probe/report.js";
import type { ProbeReport, ProbeResult } from "./persona-probe/types.js";

function parseArgs(argv: string[]): AvailabilityProbeOptions {
  const args = argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };
  const has = (flag: string): boolean => args.includes(flag);

  const agent =
    get("--agent") ??
    process.env["AVAILABILITY_PROBE_AGENT"] ??
    process.env["PERSONA_PROBE_AGENT"] ??
    "";
  if (!agent) {
    process.stderr.write(
      "Error: --agent <id> is required (or set AVAILABILITY_PROBE_AGENT / PERSONA_PROBE_AGENT)\n",
    );
    process.exit(1);
  }

  return {
    agent,
    host:
      get("--host") ??
      process.env["AVAILABILITY_PROBE_HOST"] ??
      process.env["PERSONA_PROBE_HOST"] ??
      "claw",
    outputDir: get("--output") ?? ".artifacts/availability-probe",
    tags: (get("--tags") ?? "").split(",").filter(Boolean),
    group: get("--group") ?? null,
    noBaseline: has("--no-baseline"),
    writeJson: has("--json"),
  };
}

function filterCases(opts: AvailabilityProbeOptions) {
  return AVAILABILITY_CASES.filter((c) => {
    if (c.skip) {
      return false;
    }
    if (opts.group && c.group !== opts.group) {
      return false;
    }
    if (opts.tags.length > 0 && !opts.tags.some((t) => c.tags?.includes(t))) {
      return false;
    }
    return true;
  });
}

async function runProbe(
  opts: AvailabilityProbeOptions,
  probeCase: ReturnType<typeof availabilityCasesToProbeCases>[number],
): Promise<ProbeResult> {
  let turn = null;
  let error: string | undefined;

  try {
    turn = await captureProbe({
      host: opts.host,
      agentId: opts.agent,
      message: probeCase.message,
      probeId: probeCase.id,
    });
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return evaluateProbe(probeCase, turn, error);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);
  const idSet = new Set(filterCases(opts).map((c) => c.id));
  const probeCases = availabilityCasesToProbeCases().filter((p) => idSet.has(p.id));

  if (probeCases.length === 0) {
    process.stderr.write("No availability probe cases matched the given filters.\n");
    process.exit(1);
  }

  const outputDir = path.resolve(opts.outputDir);
  const baseline = opts.noBaseline ? null : await loadBaseline(outputDir);

  process.stdout.write(
    `\x1b[1m[availability-probe]\x1b[0m Running ${probeCases.length} probe(s) against ` +
      `\x1b[36m${opts.agent}\x1b[0m @ \x1b[36m${opts.host}\x1b[0m\n` +
      `\x1b[90m(duration = full openclaw agent round-trip; align cases.ts readingSpeed with server config)\x1b[0m\n`,
  );

  const results: ProbeResult[] = [];

  for (const probeCase of probeCases) {
    process.stdout.write(`  \x1b[90m→ ${probeCase.id}\x1b[0m\n`);
    const result = await runProbe(opts, probeCase);
    results.push(result);
  }

  const report: ProbeReport = {
    runAt: new Date().toISOString(),
    agent: opts.agent,
    host: opts.host,
    results,
    baseline,
    harness: "availability-probe",
  };

  await writeReports(report, outputDir, opts.writeJson);

  const failed = results.filter((r) => r.verdict === "fail" || r.verdict === "error").length;
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
