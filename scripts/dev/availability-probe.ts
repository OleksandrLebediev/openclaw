#!/usr/bin/env bun
/**
 * availability-probe — smoke-test agent availability (reading delay, wall time) on a remote host.
 *
 * Reuses persona-probe capture (SSH → `openclaw agent --json`) and evaluates **wall-clock**
 * `durationMs` against expected reading delay from the same `computeReadingDelayMs` helper as
 * the gateway (see `src/agents/availability.ts`).
 *
 * Reading cases are generated per **preset** (`scripts/dev/availability-probe/presets.ts`).
 * Use **`--preset <id>`** so only cases matching the server’s `readingSpeed` run (default: `default`).
 * **`--preset all`** runs every preset’s reading cases (only useful if the server config matches
 * each block, or you accept noisy failures).
 *
 * **`--reading-speed '<json>'`** merges onto each case’s expected `{ wpm, minMs, maxMs }` for
 * evaluation (CLI wins per field) without editing `cases.ts`.
 *
 * Docs: `docs/help/remote-probes.md` (published as /help/remote-probes — not the Vitest testing guide).
 *
 * Usage:
 *   pnpm availability:probe -- [options]
 *   # or: node --import tsx scripts/dev/availability-probe.ts [options]
 *
 *   --list-presets      Print preset IDs + JSON for gateway config, then exit
 *   --preset  <id>      `default` | `high-min` | `slow-wpm` | `tight-cap` | `all` (default: default)
 *   --reading-speed <json>  Merge over expected readingSpeed for all reading cases
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
import {
  AVAILABILITY_READING_PRESETS,
  listReadingPresetsText,
} from "./availability-probe/presets.js";
import type { AvailabilityProbeOptions, ReadingSpeedExpect } from "./availability-probe/types.js";
import { captureProbe } from "./persona-probe/capture.js";
import { evaluateProbe } from "./persona-probe/evaluate.js";
import { loadBaseline, writeReports } from "./persona-probe/report.js";
import type { ProbeReport, ProbeResult } from "./persona-probe/types.js";

const PRESET_IDS = new Set(AVAILABILITY_READING_PRESETS.map((p) => p.id));

function parseReadingSpeedMerge(raw: string | undefined): ReadingSpeedExpect | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      process.stderr.write("Error: --reading-speed must be a JSON object\n");
      process.exit(1);
    }
    return parsed as ReadingSpeedExpect;
  } catch {
    process.stderr.write("Error: --reading-speed must be valid JSON\n");
    process.exit(1);
  }
}

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

  const presetRaw = get("--preset") ?? "default";
  if (presetRaw !== "all" && !PRESET_IDS.has(presetRaw)) {
    process.stderr.write(
      `Error: unknown --preset ${JSON.stringify(presetRaw)}. ` +
        `Expected one of: ${[...PRESET_IDS].join(", ")}, all\n`,
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
    preset: presetRaw,
    readingSpeedMerge: parseReadingSpeedMerge(get("--reading-speed")),
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
    if (c.preset != null) {
      if (opts.preset === "all") {
        return true;
      }
      if (c.preset !== opts.preset) {
        return false;
      }
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
  const argv = process.argv;
  if (argv.includes("--list-presets")) {
    process.stdout.write(`${listReadingPresetsText()}\n`);
    process.exit(0);
  }

  const opts = parseArgs(argv);
  const idSet = new Set(filterCases(opts).map((c) => c.id));
  const merge = opts.readingSpeedMerge ?? undefined;
  const probeCases = availabilityCasesToProbeCases(merge).filter((p) => idSet.has(p.id));

  if (probeCases.length === 0) {
    process.stderr.write("No availability probe cases matched the given filters.\n");
    process.exit(1);
  }

  const outputDir = path.resolve(opts.outputDir);
  const baseline = opts.noBaseline ? null : await loadBaseline(outputDir);

  const presetNote =
    opts.preset === "all"
      ? "preset=all (every reading preset; server must match each case’s readingSpeed)"
      : `preset=${opts.preset}`;
  process.stdout.write(
    `\x1b[1m[availability-probe]\x1b[0m Running ${probeCases.length} probe(s) against ` +
      `\x1b[36m${opts.agent}\x1b[0m @ \x1b[36m${opts.host}\x1b[0m\n` +
      `\x1b[90m(${presetNote}; align gateway readingSpeed or pass --reading-speed JSON)\x1b[0m\n`,
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
