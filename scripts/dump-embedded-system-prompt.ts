/**
 * Dump the embedded system prompt (buildEmbeddedSystemPrompt) to a file for inspection.
 *
 * Usage:
 *   pnpm dump:embedded-system-prompt -- [--human|--agent] [-o path]
 *   node --import tsx scripts/dump-embedded-system-prompt.ts [--human|--agent] [-o path]
 *
 * Default: --human, output tmp/agent-system-prompt-embedded.txt
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { buildEmbeddedSystemPrompt } from "../src/agents/pi-embedded-runner/system-prompt.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function parseArgs(argv: string[]) {
  let mode: "human" | "agent" = "human";
  let out = path.join(repoRoot, "tmp/agent-system-prompt-embedded.txt");
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--human") {
      mode = "human";
    } else if (a === "--agent") {
      mode = "agent";
    } else if (a === "-o" && argv[i + 1]) {
      out = path.resolve(argv[++i]);
    }
  }
  return { mode, out };
}

/** Minimal names for prompt assembly demos; live runs use the real tool graph from policy. */
function stubTools(mode: "human" | "agent"): AgentTool[] {
  if (mode === "human") {
    return [{ name: "message" }] as AgentTool[];
  }
  return [
    { name: "read" },
    { name: "exec" },
    { name: "process" },
    { name: "message" },
    { name: "gateway" },
    { name: "cron" },
    { name: "session_status" },
  ] as AgentTool[];
}

const { mode, out } = parseArgs(process.argv.slice(2));

const prompt = buildEmbeddedSystemPrompt({
  workspaceDir: path.join(repoRoot, "tmp/dump-embedded-workspace"),
  reasoningTagHint: false,
  runtimeInfo: {
    host: "dump-host",
    os: "linux",
    arch: "arm64",
    node: "22",
    model: "openai/gpt-5.4-nano",
    provider: "openai",
    channel: "telegram",
  },
  tools: stubTools(mode),
  modelAliasLines: [],
  userTimezone: "America/Los_Angeles",
  personaMode: mode,
  skillsPrompt: "<available_skills>\n  <skill><name>demo</name></skill>\n</available_skills>",
});

await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, prompt, "utf8");
process.stdout.write(
  `Wrote ${prompt.length} chars to ${path.relative(repoRoot, out)} (personaMode=${mode})\n`,
);
