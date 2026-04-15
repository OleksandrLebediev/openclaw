import { execFile } from "node:child_process";
// Capture module: runs the agent via SSH and parses session JSONL.
// Every `captureProbe` call uses a new explicit `--session-id` (`<probeId>-<uuid>`) so each probe is
// a fresh chat session, then reads that session's transcript by deterministic path (not `ls -t`).
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { normalizeAgentId } from "../../../src/routing/session-key.js";
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

// ─── Session isolation (ephemeral explicit session per probe) ─────────────────

/** Session store key for `openclaw agent --session-id …` (matches gateway/CLI resolution). */
export function probeExplicitSessionStoreKey(agentId: string, sessionId: string): string {
  return `agent:${normalizeAgentId(agentId)}:explicit:${sessionId.trim()}`;
}

/** Remote shell command body for one persona-probe agent invocation (for tests + single place for quoting). */
export function buildPersonaProbeAgentSshCommand(opts: {
  message: string;
  agentId: string;
  sessionId: string;
}): string {
  const safeMsg = opts.message.replace(/'/g, "'\\''");
  const safeAgent = opts.agentId.replace(/'/g, "'\\''");
  const safeSession = opts.sessionId.replace(/'/g, "'\\''");
  return `openclaw agent --message '${safeMsg}' --agent '${safeAgent}' --session-id '${safeSession}' --json 2>&1`;
}

/** Default OpenClaw transcript path on the remote host for a session id (matches `resolveSessionTranscriptPathInDir`). */
export function probeSessionJsonlRemotePath(agentId: string, sessionId: string): string {
  const id = normalizeAgentId(agentId);
  const safeSession = sessionId.replace(/'/g, "'\\''");
  return `~/.openclaw/agents/${id}/sessions/${safeSession}.jsonl`;
}

async function deleteSessionStoreEntry(
  host: string,
  agentId: string,
  sessionKey: string,
): Promise<void> {
  const id = normalizeAgentId(agentId);
  const storeFile = `~/.openclaw/agents/${id}/sessions/sessions.json`;
  try {
    const raw = await sshRun(host, `cat '${storeFile}' 2>/dev/null || echo '{}'`);
    const store = JSON.parse(raw) as Record<string, unknown>;
    if (!(sessionKey in store)) {
      return;
    }
    delete store[sessionKey];
    const updated = JSON.stringify(store, null, 2);
    const safeJson = updated.replace(/'/g, "'\\''");
    await sshRun(host, `printf '%s' '${safeJson}' > '${storeFile}'`);
  } catch {
    // Non-fatal — best-effort cleanup so sessions.json does not fill with probe keys
  }
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
 * 1. Pick a fresh `--session-id` (explicit session: `<probeId>-<uuid>`) so this turn has no shared history
 * 2. SSH → `openclaw agent --message '...' --agent <id> --session-id <id> --json`
 * 3. Parse JSON response text
 * 4. Read `~/.openclaw/agents/<agent>/sessions/<sessionId>.jsonl` → extract tool calls + bootstrap status
 * 5. Remove the ephemeral explicit session entry from sessions.json (best-effort)
 */
export async function captureProbe(params: CaptureParams): Promise<TurnResult> {
  const { host, agentId, message, probeId } = params;

  const sessionId = `${probeId}-${randomUUID()}`;
  const sessionKey = probeExplicitSessionStoreKey(agentId, sessionId);
  const agentCmd = buildPersonaProbeAgentSshCommand({ message, agentId, sessionId });
  const transcriptPath = probeSessionJsonlRemotePath(agentId, sessionId);

  const start = Date.now();
  let rawJson: string;
  try {
    rawJson = await sshRun(host, agentCmd);
  } catch (err) {
    await deleteSessionStoreEntry(host, agentId, sessionKey);
    throw new Error(`SSH agent call failed: ${err instanceof Error ? err.message : String(err)}`, {
      cause: err,
    });
  }
  const durationMs = Date.now() - start;

  // Parse response text from JSON output.
  // Strip leading non-JSON lines (gateway fallback warnings written to stdout).
  let response = "";
  try {
    const jsonStart = rawJson.indexOf("{");
    const jsonStr = jsonStart >= 0 ? rawJson.slice(jsonStart) : rawJson;
    const parsed = JSON.parse(jsonStr) as unknown;
    response = extractResponseText(parsed);
  } catch {
    // Fallback: last non-empty line that doesn't look like a gateway warning
    const lines = rawJson
      .split("\n")
      .map((l) => l.trim())
      .filter(
        (l) =>
          l.length > 0 &&
          !l.startsWith("gateway") &&
          !l.startsWith("Gateway") &&
          !l.startsWith("Source:") &&
          !l.startsWith("Config:") &&
          !l.startsWith("Bind:"),
      );
    response = lines[lines.length - 1] ?? "";
  }

  let sessionFile = "";
  let toolCalls: ToolCall[] = [];
  let bootstrapLoaded = false;

  try {
    const jsonlContent = await sshRun(host, `cat '${transcriptPath}' 2>/dev/null || true`);
    if (jsonlContent.trim()) {
      sessionFile = transcriptPath;
      const parsed = parseLastTurn(jsonlContent);
      toolCalls = parsed.toolCalls;
      bootstrapLoaded = parsed.bootstrapLoaded;
    }
  } catch {
    // Non-fatal: session JSONL reading is best-effort
  } finally {
    await deleteSessionStoreEntry(host, agentId, sessionKey);
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
