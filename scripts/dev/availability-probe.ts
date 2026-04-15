#!/usr/bin/env node
/**
 * availability-probe — smoke-test agent availability (reading / writing delay vs wall time) on a remote host.
 *
 * Reuses persona-probe capture (SSH → `openclaw agent --json`) and evaluates **wall-clock**
 * `durationMs` against `computeReadingDelayMs` / `computeWritingDelayMs` from `src/agents/availability.ts`.
 *
 * **Reading** cases vary **inbound** length. **Writing** cases ask for a fixed echo so expectations
 * use **assistant response length** for `writingSpeed` (combined with reading on the same inbound
 * message when both are configured). The `openclaw agent` CLI often does **not** include channel
 * outbound `writingSpeed` sleep — those rows may WARN even when Telegram delivery is correct.
 *
 * Reading + writing cases are generated per **preset** (`scripts/dev/availability-probe/presets.ts`).
 * Use **`--preset <id>`** so only cases matching the server’s speeds run (default: `default`).
 *
 * **`--reading-speed` / `--writing-speed` '<json>'** merge onto expectations (CLI wins per field).
 *
 * Docs: `docs/help/remote-probes.md` (published as /help/remote-probes — not the Vitest testing guide).
 *
 * Usage:
 *   pnpm availability:probe -- [options]
 *   # or: node --import tsx scripts/dev/availability-probe.ts [options]
 *
 *   --list-presets      Print preset IDs + JSON for gateway config, then exit
 *   --preset  <id>      `default` | `high-min` | `slow-wpm` | `tight-cap` | `all` (default: default)
 *   --reading-speed <json>  Merge over expected readingSpeed
 *   --writing-speed <json>  Merge over expected writingSpeed (writing group + combined checks)
 *   --agent   <id>      Agent ID (default: AVAILABILITY_PROBE_AGENT or PERSONA_PROBE_AGENT or "lilu")
 *   --host    <alias>   SSH host (default: AVAILABILITY_PROBE_HOST or PERSONA_PROBE_HOST or "claw")
 *   --output  <dir>     Artifacts (default: .artifacts/availability-probe)
 *   --group   <name>    Run one group: reading | writing | sanity | offline
 *   --tags    <a,b>     Comma-separated tags
 *   --no-baseline       Skip baseline diff/update
 *   --json              Also write JSON report
 *   --print-expectations  Print Markdown tables of expected read/write delays (no SSH, no --agent)
 */
import path from "node:path";
import { availabilityCasesToProbeCases, AVAILABILITY_CASES } from "./availability-probe/cases.js";
import {
  AVAILABILITY_READING_PRESETS,
  listReadingPresetsText,
} from "./availability-probe/presets.js";
import {
  printAvailabilityExpectations,
  type PrintExpectationsParams,
} from "./availability-probe/print-expectations.js";
import type { AvailabilityProbeOptions, ReadingSpeedExpect } from "./availability-probe/types.js";
import { captureProbe } from "./persona-probe/capture.js";
import { evaluateProbe } from "./persona-probe/evaluate.js";
import { loadBaseline, writeReports } from "./persona-probe/report.js";
import type { ProbeReport, ProbeResult } from "./persona-probe/types.js";

const PRESET_IDS = new Set(AVAILABILITY_READING_PRESETS.map((p) => p.id));

function parsePrintExpectationsArgs(argv: string[]): PrintExpectationsParams {
  const args = argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };
  const presetRaw = get("--preset") ?? "default";
  if (presetRaw !== "all" && !PRESET_IDS.has(presetRaw)) {
    process.stderr.write(
      `Error: unknown --preset ${JSON.stringify(presetRaw)}. ` +
        `Expected one of: ${[...PRESET_IDS].join(", ")}, all\n`,
    );
    process.exit(1);
  }
  return {
    preset: presetRaw,
    readingSpeedMerge: parseSpeedMerge("--reading-speed", get("--reading-speed")),
    writingSpeedMerge: parseSpeedMerge("--writing-speed", get("--writing-speed")),
  };
}

function parseSpeedMerge(flag: string, raw: string | undefined): ReadingSpeedExpect | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      process.stderr.write(`Error: ${flag} must be a JSON object\n`);
      process.exit(1);
    }
    return parsed as ReadingSpeedExpect;
  } catch {
    process.stderr.write(`Error: ${flag} must be valid JSON\n`);
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
    "lilu";

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
    readingSpeedMerge: parseSpeedMerge("--reading-speed", get("--reading-speed")),
    writingSpeedMerge: parseSpeedMerge("--writing-speed", get("--writing-speed")),
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

function buildAvailabilityRunContext(opts: AvailabilityProbeOptions): string {
  const lines: string[] = [
    "Each probe uses **passwordless SSH** to the host above and runs **`openclaw agent --json`** once with the **Input** message (session isolation and capture details: `scripts/dev/persona-probe/capture.ts`).",
    "",
    "**What is measured:** wall-clock `durationMs` for the full remote `openclaw agent` round trip (SSH, any gateway availability delay, and model inference).",
    "",
    "**Reading probes:** compares `durationMs` to **`computeReadingDelayMs(message, readingSpeed)`** from `src/agents/availability.ts`, using the readingSpeed preset encoded in that probe (see **Scenario** per row). Optional **`--reading-speed`** JSON is merged on top of that preset for the same run. Lower-bound misses are usually **warn** severity because model latency can dominate.",
    "",
    "**Writing probes:** compare `durationMs` to **read(inbound) + write(`response`)** using `computeWritingDelayMs` (5 characters = one typing word). Optional **`--writing-speed`** JSON merges like reading. If the measured path is `openclaw agent` only, outbound channel delay may be absent — interpret WARN rows accordingly.",
    "",
  ];
  if (opts.preset === "all") {
    lines.push(
      "- **Preset:** `all` — runs every built-in preset (several inbound reading lengths + two writing echoes per preset, plus sanity when not filtered). Each row expects the speeds tied to that probe id; the gateway may still differ, so read **Check outcomes**.",
    );
  } else {
    const groupHint = opts.group ? ` **Group:** \`${opts.group}\` (other groups omitted).` : "";
    lines.push(
      `- **Preset:** \`${opts.preset}\` — reading + writing cases for that preset.${groupHint}`,
    );
  }
  const mergeKeys = opts.readingSpeedMerge ? Object.keys(opts.readingSpeedMerge) : [];
  if (mergeKeys.length > 0) {
    lines.push(
      `- **CLI merge (reading):** \`${JSON.stringify(opts.readingSpeedMerge)}\` merged over each case’s preset readingSpeed when computing expectations.`,
    );
  }
  const writeMergeKeys = opts.writingSpeedMerge ? Object.keys(opts.writingSpeedMerge) : [];
  if (writeMergeKeys.length > 0) {
    lines.push(
      `- **CLI merge (writing):** \`${JSON.stringify(opts.writingSpeedMerge)}\` merged over each case’s preset writingSpeed when computing expectations.`,
    );
  }
  lines.push(
    "- **How to read results:** the summary table is a quick scan; each **Raw Responses** block lists **Scenario**, **Timing**, every **Check outcomes** line (PASS/FAIL and the rubric text), then the model reply.",
  );
  return lines.join("\n");
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
  if (argv.includes("--print-expectations")) {
    printAvailabilityExpectations(parsePrintExpectationsArgs(argv));
    process.exit(0);
  }

  const opts = parseArgs(argv);
  const idSet = new Set(filterCases(opts).map((c) => c.id));
  const mergeRead = opts.readingSpeedMerge ?? undefined;
  const mergeWrite = opts.writingSpeedMerge ?? undefined;
  const probeCases = availabilityCasesToProbeCases(mergeRead, mergeWrite).filter((p) =>
    idSet.has(p.id),
  );

  if (probeCases.length === 0) {
    process.stderr.write("No availability probe cases matched the given filters.\n");
    process.exit(1);
  }

  const outputDir = path.resolve(opts.outputDir);
  const baseline = opts.noBaseline ? null : await loadBaseline(outputDir);

  const presetNote =
    opts.preset === "all"
      ? "preset=all (every preset block; align readingSpeed + writingSpeed)"
      : `preset=${opts.preset}`;
  process.stdout.write(
    `\x1b[1m[availability-probe]\x1b[0m Running ${probeCases.length} probe(s) against ` +
      `\x1b[36m${opts.agent}\x1b[0m @ \x1b[36m${opts.host}\x1b[0m\n` +
      `\x1b[90m(${presetNote}; align gateway readingSpeed/writingSpeed or pass --reading-speed / --writing-speed JSON)\x1b[0m\n`,
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
    runContext: buildAvailabilityRunContext(opts),
  };

  await writeReports(report, outputDir, opts.writeJson);

  const failed = results.filter((r) => r.verdict === "fail" || r.verdict === "error").length;
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
