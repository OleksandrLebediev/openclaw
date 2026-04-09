// Report module: terminal ANSI output + Markdown file + baseline diff.
import fs from "node:fs/promises";
import path from "node:path";
import type { BaselineEntry, ProbeReport, ProbeResult, ProbeVerdict } from "./types.js";

// ─── ANSI colors ──────────────────────────────────────────────────────────────

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  magenta: "\x1b[35m",
};

function verdictColor(v: ProbeVerdict): string {
  switch (v) {
    case "pass":
      return c.green;
    case "warn":
      return c.yellow;
    case "fail":
      return c.red;
    case "error":
      return c.magenta;
  }
}

function verdictLabel(v: ProbeVerdict): string {
  switch (v) {
    case "pass":
      return "PASS ";
    case "warn":
      return "WARN ";
    case "fail":
      return "FAIL ";
    case "error":
      return "ERROR";
  }
}

// ─── Baseline helpers ─────────────────────────────────────────────────────────

type DiffEntry = { probeId: string; was: ProbeVerdict; now: ProbeVerdict };

function diffBaseline(results: ProbeResult[], baseline: BaselineEntry[]): DiffEntry[] {
  const diffs: DiffEntry[] = [];
  for (const result of results) {
    const prev = baseline.find((b) => b.probeId === result.probeId);
    if (prev && prev.verdict !== result.verdict) {
      diffs.push({ probeId: result.probeId, was: prev.verdict, now: result.verdict });
    }
  }
  return diffs;
}

// ─── Terminal output ──────────────────────────────────────────────────────────

function truncate(s: string, n: number): string {
  const oneLine = s.replace(/\s+/g, " ").trim();
  return oneLine.length > n ? oneLine.slice(0, n - 1) + "…" : oneLine;
}

export function printTerminalReport(report: ProbeReport, diffs: DiffEntry[]): void {
  const { results, agent, host, runAt } = report;

  process.stdout.write(
    `\n${c.bold}[persona-probe]${c.reset} ${c.cyan}${agent}${c.reset} @ ${c.cyan}${host}${c.reset}  ${c.gray}${runAt}${c.reset}\n\n`,
  );

  // Group results
  const groups = [...new Set(results.map((r) => r.group))];

  for (const group of groups) {
    const groupResults = results.filter((r) => r.group === group);
    process.stdout.write(`  ${c.bold}${c.dim}GROUP ${group.toUpperCase()}${c.reset}\n`);

    for (const result of groupResults) {
      const vc = verdictColor(result.verdict);
      const vl = verdictLabel(result.verdict);
      const dur = result.turn ? `${(result.turn.durationMs / 1000).toFixed(1)}s` : "—";
      const responsePreview = result.turn
        ? truncate(result.turn.response, 72)
        : (result.error ?? "no response");

      process.stdout.write(
        `  ${vc}${c.bold}${vl}${c.reset}  ${c.gray}${dur.padEnd(5)}${c.reset}  "${truncate(result.message, 40)}"` +
          `\n         ${c.dim}→ ${responsePreview}${c.reset}\n`,
      );

      // Show failed checks
      for (const cr of result.checkResults) {
        if (!cr.passed) {
          const sev = (cr.check.severity ?? "fail") === "warn" ? c.yellow : c.red;
          process.stdout.write(`         ${sev}↳ ${cr.reason}${c.reset}\n`);
        }
      }

      // Show tool calls
      if (result.turn && result.turn.toolCalls.length > 0) {
        const names = result.turn.toolCalls.map((t) => t.name).join(", ");
        process.stdout.write(`         ${c.gray}tools: [${names}]${c.reset}\n`);
      }

      process.stdout.write("\n");
    }
  }

  // Summary
  const pass = results.filter((r) => r.verdict === "pass").length;
  const warn = results.filter((r) => r.verdict === "warn").length;
  const fail = results.filter((r) => r.verdict === "fail").length;
  const err = results.filter((r) => r.verdict === "error").length;
  const total = results.length;

  process.stdout.write(
    `  ${c.bold}Summary:${c.reset} ${total} probes  ` +
      `${c.green}${pass} pass${c.reset}  ${c.yellow}${warn} warn${c.reset}  ${c.red}${fail} fail${c.reset}` +
      (err > 0 ? `  ${c.magenta}${err} error${c.reset}` : "") +
      "\n",
  );

  // Baseline diff
  if (diffs.length > 0) {
    process.stdout.write(`\n  ${c.bold}Baseline changes:${c.reset}\n`);
    for (const d of diffs) {
      const wasColor = verdictColor(d.was);
      const nowColor = verdictColor(d.now);
      const label =
        d.was === "pass" && d.verdict !== "pass"
          ? `${c.red}REGRESS${c.reset}`
          : `${c.green}FIXED  ${c.reset}`;
      process.stdout.write(
        `  ${label}  ${d.probeId}  ${wasColor}${d.was}${c.reset} → ${nowColor}${d.now}${c.reset}\n`,
      );
    }
  }

  process.stdout.write("\n");
}

// ─── Markdown report ──────────────────────────────────────────────────────────

function mdEscape(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function buildMarkdown(report: ProbeReport, diffs: DiffEntry[]): string {
  const { results, agent, host, runAt } = report;
  const lines: string[] = [];

  lines.push(`# Persona Probe Report`);
  lines.push(``);
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| Run at | ${runAt} |`);
  lines.push(`| Agent | \`${agent}\` |`);
  lines.push(`| Host | \`${host}\` |`);

  const pass = results.filter((r) => r.verdict === "pass").length;
  const warn = results.filter((r) => r.verdict === "warn").length;
  const fail = results.filter((r) => r.verdict === "fail").length;
  const err = results.filter((r) => r.verdict === "error").length;

  lines.push(`| Summary | ${pass} pass / ${warn} warn / ${fail} fail / ${err} error |`);
  lines.push(``);

  // Baseline diff
  if (diffs.length > 0) {
    lines.push(`## Baseline Changes`);
    lines.push(``);
    lines.push(`| Probe | Was | Now |`);
    lines.push(`|-------|-----|-----|`);
    for (const d of diffs) {
      lines.push(`| \`${d.probeId}\` | ${d.was} | **${d.now}** |`);
    }
    lines.push(``);
  }

  // Results by group
  const groups = [...new Set(results.map((r) => r.group))];

  for (const group of groups) {
    lines.push(`## Group: ${group}`);
    lines.push(``);
    lines.push(`| Result | Probe | Message | Tools | Failed Check | Response |`);
    lines.push(`|--------|-------|---------|-------|-------------|----------|`);

    for (const result of results.filter((r) => r.group === group)) {
      const verdict = result.verdict.toUpperCase();
      const tools =
        result.turn && result.turn.toolCalls.length > 0
          ? result.turn.toolCalls.map((t) => `\`${t.name}\``).join(", ")
          : "—";
      const failedChecks = result.checkResults
        .filter((cr) => !cr.passed)
        .map((cr) => mdEscape(cr.reason))
        .join("; ");
      const response = result.turn
        ? mdEscape(truncate(result.turn.response, 120))
        : (result.error ?? "—");

      lines.push(
        `| ${verdict} | \`${result.probeId}\` | ${mdEscape(result.message)} | ${tools} | ${failedChecks || "—"} | ${response} |`,
      );
    }
    lines.push(``);
  }

  // Raw responses
  lines.push(`## Raw Responses`);
  lines.push(``);

  for (const result of results) {
    lines.push(`### \`${result.probeId}\``);
    lines.push(``);
    lines.push(`**Input:** ${result.message}`);
    lines.push(``);
    if (result.turn) {
      lines.push(`**Response:**`);
      lines.push(``);
      lines.push("```");
      lines.push(result.turn.response);
      lines.push("```");
      lines.push(``);
      if (result.turn.toolCalls.length > 0) {
        lines.push(`**Tool calls:**`);
        lines.push(``);
        for (const tc of result.turn.toolCalls) {
          lines.push(`- \`${tc.name}\` — args: \`${JSON.stringify(tc.args)}\``);
          if (tc.result) {
            lines.push(`  - result: ${truncate(tc.result, 200)}`);
          }
        }
        lines.push(``);
      }
      lines.push(`*Session file: \`${result.turn.sessionFile}\`*`);
    } else {
      lines.push(`**Error:** ${result.error ?? "unknown"}`);
    }
    lines.push(``);
  }

  return lines.join("\n");
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function writeReports(
  report: ProbeReport,
  outputDir: string,
  writeJson: boolean,
): Promise<{ mdPath: string; jsonPath?: string; baselinePath: string }> {
  await fs.mkdir(outputDir, { recursive: true });

  const ts = report.runAt.replace(/[:.]/g, "-").replace("T", "T").slice(0, 19);

  const diffs = report.baseline ? diffBaseline(report.results, report.baseline) : [];

  // Terminal
  printTerminalReport(report, diffs);

  // Markdown
  const mdPath = path.join(outputDir, `report-${ts}.md`);
  const md = buildMarkdown(report, diffs);
  await fs.writeFile(mdPath, md, "utf-8");
  process.stdout.write(`  Report:   ${mdPath}\n`);

  // Baseline update
  const baselinePath = path.join(outputDir, "baseline.json");
  const newBaseline: BaselineEntry[] = report.results.map((r) => ({
    probeId: r.probeId,
    verdict: r.verdict,
    runAt: report.runAt,
  }));
  await fs.writeFile(baselinePath, JSON.stringify(newBaseline, null, 2), "utf-8");
  process.stdout.write(`  Baseline: ${baselinePath}\n`);

  // JSON artifact
  let jsonPath: string | undefined;
  if (writeJson) {
    jsonPath = path.join(outputDir, `report-${ts}.json`);
    await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), "utf-8");
    process.stdout.write(`  JSON:     ${jsonPath}\n`);
  }

  process.stdout.write("\n");

  return { mdPath, jsonPath, baselinePath };
}

export function loadBaseline(outputDir: string): Promise<BaselineEntry[] | null> {
  const baselinePath = path.join(outputDir, "baseline.json");
  return fs
    .readFile(baselinePath, "utf-8")
    .then((raw) => JSON.parse(raw) as BaselineEntry[])
    .catch(() => null);
}
