// Capture module: runs the agent via SSH and parses session JSONL.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ToolCall, TurnResult } from "./types.js";

const execFileAsync = promisify(execFile);

const SSH_TIMEOUT_MS = 60_000;

// ─── SSH helpers ─────────────────────────────────────────────────────────────

async function sshRun(host: string, cmd: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "ssh",
    ["-o", "BatchMode=yes", "-o", "ConnectTimeout=20", host, cmd],
    {
      timeout: SSH_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024, // 10 MB
    },
  );
  return stdout;
}

// ─── Session JSONL parsing ────────────────────────────────────────────────────

type JournalEntry = { type: string; [key: string]: unknown };

/** Parse tool calls and bootstrap status from the last turn in a session JSONL. */
function parseLastTurn(jsonlContent: string): { toolCalls: ToolCall[]; bootstrapLoaded: boolean } {
  const lines = jsonlContent
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const entries: JournalEntry[] = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line) as JournalEntry);
    } catch {
      // skip malformed lines
    }
  }

  // Find the last user message index — the last turn starts there
  let lastUserIdx = -1;
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.type === "message") {
      const msg = e.message as { role?: string } | undefined;
      if (msg?.role === "user") {
        lastUserIdx = i;
        break;
      }
    }
  }

  const turnEntries = lastUserIdx >= 0 ? entries.slice(lastUserIdx) : entries;

  const toolCalls: ToolCall[] = [];
  let bootstrapLoaded = false;

  for (const entry of turnEntries) {
    // Check for bootstrap-context custom entry
    if (entry.type === "custom") {
      const ct = entry.customType as string | undefined;
      if (ct === "openclaw:bootstrap-context:full") {
        bootstrapLoaded = true;
      }
    }

    // Tool calls are in assistant messages with toolCall content blocks
    if (entry.type === "message") {
      const msg = entry.message as { role?: string; content?: unknown } | undefined;
      if (msg?.role === "assistant" && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          const b = block as { type?: string; id?: string; name?: string; arguments?: unknown };
          if (b.type === "toolCall") {
            toolCalls.push({
              name: b.name ?? "unknown",
              args: b.arguments ?? null,
              result: "",
            });
          }
        }
      }

      // Attach results to the preceding tool call
      if (msg?.role === "toolResult" && Array.isArray(msg.content)) {
        const last = toolCalls[toolCalls.length - 1];
        if (last) {
          const textBlocks = (msg.content as { type?: string; text?: string }[])
            .filter((b) => b.type === "text")
            .map((b) => b.text ?? "")
            .join("\n");
          last.result = textBlocks;
        }
      }
    }
  }

  return { toolCalls, bootstrapLoaded };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type CaptureParams = {
  host: string;
  agentId: string;
  message: string;
  probeId: string;
};

/**
 * Run a probe:
 * 1. SSH → `openclaw agent --message '...' --agent <id> --json`
 * 2. Parse JSON response text
 * 3. Read latest session JSONL → extract tool calls + bootstrap status
 */
export async function captureProbe(params: CaptureParams): Promise<TurnResult> {
  const { host, agentId, message, probeId } = params;

  const safeMsg = message.replace(/'/g, "'\\''");
  const agentCmd = `openclaw agent --message '${safeMsg}' --agent '${agentId}' --json`;

  const start = Date.now();
  let rawJson: string;
  try {
    rawJson = await sshRun(host, agentCmd);
  } catch (err) {
    throw new Error(`SSH agent call failed: ${err instanceof Error ? err.message : String(err)}`, {
      cause: err,
    });
  }
  const durationMs = Date.now() - start;

  // Parse response text from JSON output
  let response = "";
  try {
    const parsed = JSON.parse(rawJson) as unknown;
    response = extractResponseText(parsed);
  } catch {
    // Fallback: treat raw stdout as the response
    response = rawJson.trim();
  }

  // Find the latest session JSONL file
  let sessionFile = "";
  let toolCalls: ToolCall[] = [];
  let bootstrapLoaded = false;

  try {
    const lsOut = await sshRun(
      host,
      `ls -t ~/.openclaw/agents/${agentId}/sessions/ 2>/dev/null | head -1`,
    );
    const latestFile = lsOut.trim();
    if (latestFile) {
      sessionFile = `~/.openclaw/agents/${agentId}/sessions/${latestFile}`;
      const jsonlContent = await sshRun(host, `cat '${sessionFile}'`);
      const parsed = parseLastTurn(jsonlContent);
      toolCalls = parsed.toolCalls;
      bootstrapLoaded = parsed.bootstrapLoaded;
    }
  } catch {
    // Non-fatal: session JSONL reading is best-effort
  }

  return { probeId, message, response, toolCalls, bootstrapLoaded, durationMs, sessionFile };
}

// ─── Response text extraction ─────────────────────────────────────────────────

/** Extract the final assistant text from the gateway --json response envelope. */
function extractResponseText(parsed: unknown): string {
  if (typeof parsed !== "object" || parsed === null) {
    return String(parsed);
  }

  const obj = parsed as Record<string, unknown>;

  // Gateway mode: { reply: string | { text: string } }
  if (typeof obj.reply === "string") {
    return obj.reply;
  }
  if (typeof obj.reply === "object" && obj.reply !== null) {
    const r = obj.reply as Record<string, unknown>;
    if (typeof r.text === "string") {
      return r.text;
    }
  }

  // Local/embedded mode: { payloads: [{ text: string }] }
  if (Array.isArray(obj.payloads)) {
    return obj.payloads
      .flatMap((p: unknown) => {
        if (typeof p === "object" && p !== null) {
          const pl = p as Record<string, unknown>;
          if (typeof pl.text === "string") {
            return [pl.text];
          }
        }
        return [];
      })
      .join("\n");
  }

  // text field directly
  if (typeof obj.text === "string") {
    return obj.text;
  }

  return JSON.stringify(parsed);
}
