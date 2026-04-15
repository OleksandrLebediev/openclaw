import { describe, expect, it } from "vitest";
import {
  buildPersonaProbeAgentSshCommand,
  probeExplicitSessionStoreKey,
  probeSessionJsonlRemotePath,
} from "../../scripts/dev/persona-probe/capture.ts";
import { validateSessionId } from "../../src/config/sessions/paths.ts";

describe("persona-probe capture", () => {
  it("agent SSH command includes a dedicated session id so each probe avoids shared history", () => {
    const cmd = buildPersonaProbeAgentSshCommand({
      message: "hi",
      agentId: "main",
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(cmd).toContain("--session-id '550e8400-e29b-41d4-a716-446655440000'");
    expect(cmd).toContain("--agent 'main'");
    expect(cmd).toContain("--json 2>&1");
  });

  it("escapes single quotes in message, agent id, and session id for remote shell", () => {
    const cmd = buildPersonaProbeAgentSshCommand({
      message: "it's fine",
      agentId: "ma'in",
      sessionId: "abc'def",
    });
    expect(cmd).toContain("it'\\''s fine");
    expect(cmd).toContain("ma'\\''in");
    expect(cmd).toContain("abc'\\''def");
  });

  it("session store key matches explicit-session convention", () => {
    expect(probeExplicitSessionStoreKey("main", "probe-1")).toBe("agent:main:explicit:probe-1");
  });

  it("remote transcript path matches default session file layout", () => {
    expect(
      probeSessionJsonlRemotePath(
        "lilu",
        "persona-are-you-bot-550e8400-e29b-41d4-a716-446655440000",
      ),
    ).toBe(
      "~/.openclaw/agents/lilu/sessions/persona-are-you-bot-550e8400-e29b-41d4-a716-446655440000.jsonl",
    );
  });

  it("composite probe session ids satisfy session id validation (OpenClaw transcript file names)", () => {
    const sid = "read-slow-wpm-hundred-words-550e8400-e29b-41d4-a716-446655440000";
    expect(() => validateSessionId(sid)).not.toThrow();
    expect(validateSessionId(sid)).toBe(sid);
  });
});
