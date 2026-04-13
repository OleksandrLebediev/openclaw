#!/usr/bin/env bun
/**
 * persona-probe — eval harness for human-persona agents on a remote gateway.
 *
 * Docs: `docs/help/remote-probes.md` (published as /help/remote-probes — not the Vitest testing guide).
 *
 * Usage:
 *   bun scripts/dev/persona-probe.ts [options]
 *
 *   --agent   <id>      Agent ID on the remote host (default: from PERSONA_PROBE_AGENT or required)
 *   --host    <alias>   SSH host alias (default: from PERSONA_PROBE_HOST or "claw")
 *   --output  <dir>     Artifact directory (default: .artifacts/persona-probe)
 *   --group   <name>    Run only one group (persona | traps | memory | tools)
 *   --tags    <a,b>     Run only cases with matching tags (comma-separated)
 *   --no-baseline       Skip baseline comparison and update
 *   --json              Also write raw JSON artifact alongside Markdown
 *   --concurrency <n>   Parallel probe slots (default: 1, sequential)
 */
import path from "node:path";
import { captureProbe } from "./persona-probe/capture.js";
import { PROBE_CASES } from "./persona-probe/cases.js";
import { evaluateProbe } from "./persona-probe/evaluate.js";
import { loadBaseline, writeReports } from "./persona-probe/report.js";
import type { ProbeOptions, ProbeReport, ProbeResult } from "./persona-probe/types.js";

// ─── Arg parsing ──────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): ProbeOptions {
  const args = argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };
  const has = (flag: string): boolean => args.includes(flag);

  const agent = get("--agent") ?? process.env["PERSONA_PROBE_AGENT"] ?? "";
  if (!agent) {
    process.stderr.write("Error: --agent <id> is required (or set PERSONA_PROBE_AGENT env var)\n");
    process.exit(1);
  }

  return {
    agent,
    host: get("--host") ?? process.env["PERSONA_PROBE_HOST"] ?? "claw",
    outputDir: get("--output") ?? ".artifacts/persona-probe",
    tags: (get("--tags") ?? "").split(",").filter(Boolean),
    group: get("--group") ?? null,
    noBaseline: has("--no-baseline"),
    writeJson: has("--json"),
  };
}

// ─── Case filtering ───────────────────────────────────────────────────────────

function filterCases(opts: ProbeOptions) {
  return PROBE_CASES.filter((c) => {
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

// ─── Runner ───────────────────────────────────────────────────────────────────

async function runProbe(
  opts: ProbeOptions,
  probeCase: (typeof PROBE_CASES)[number],
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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);
  const cases = filterCases(opts);

  if (cases.length === 0) {
    process.stderr.write("No probe cases matched the given filters.\n");
    process.exit(1);
  }

  const outputDir = path.resolve(opts.outputDir);
  const baseline = opts.noBaseline ? null : await loadBaseline(outputDir);

  process.stdout.write(
    `\x1b[1m[persona-probe]\x1b[0m Running ${cases.length} probe(s) against ` +
      `\x1b[36m${opts.agent}\x1b[0m @ \x1b[36m${opts.host}\x1b[0m\n`,
  );

  const results: ProbeResult[] = [];

  // Sequential by default — agents may share session state
  for (const probeCase of cases) {
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
  };

  await writeReports(report, outputDir, opts.writeJson);

  const failed = results.filter((r) => r.verdict === "fail" || r.verdict === "error").length;
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
