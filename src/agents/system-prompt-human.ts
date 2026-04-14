/**
 * Human persona (`personaMode: "human"`) tweaks to the embedded system prompt
 * and (when applicable) the tool list exposed to the model.
 *
 * Orchestrator / product scaffolding (tooling prose, CLI self-service, mandatory
 * skills discipline, gateway self-update) is gated here so `system-prompt.ts`
 * stays a single assembly pipeline with explicit persona policy.
 */

import type { OpenClawConfig } from "../config/config.js";
import { isAcpSessionKey, isCronSessionKey, isSubagentSessionKey } from "../routing/session-key.js";

export type PersonaMode = "agent" | "human";

/** Core tools kept for human persona: outbound messaging + session/runtime facts. */
export const HUMAN_PERSONA_TOOL_ALLOWLIST = new Set(["message", "session_status"]);

/** Workspace context files dropped from the human system string (persona lives in SOUL/IDENTITY/HUMAN, etc.). */
export const HUMAN_PERSONA_STRIPPED_CONTEXT_BASENAMES = new Set([
  "user.md",
  "tools.md",
  "bootstrap.md",
]);

export type HumanPersonaPromptPolicy = {
  isHuman: boolean;
  /** First line of the system prompt (before sections). */
  identityLine: string;
  /** Include the long "## Safety" constitution block. */
  includeSafetySection: boolean;
  /** Include "## Workspace" (path + note) and workspaceNotes in that block. */
  includeWorkspaceSection: boolean;
  /** Include "## Current Date & Time" when a time zone is configured. */
  includeDateTimeSection: boolean;
  /** Include the inline hint to call session_status for clock queries. */
  includeSessionStatusInlineHint: boolean;
  /** Include "## Messaging" and the "### message tool" subsection when applicable. */
  includeMessagingSection: boolean;
  /** Include "# Project Context" heading and intro paragraphs before injected files. */
  includeProjectContextBoilerplate: boolean;
  /** Include USER.md / TOOLS.md / BOOTSTRAP.md blocks when present in context files. */
  includeGenericContextFiles: boolean;
  /** Insert the OPENCLAW_CACHE_BOUNDARY marker between stable and dynamic context. */
  includePromptCacheBoundary: boolean;
  /** Append dynamic project context (e.g. HEARTBEAT.md) after the cache boundary. */
  includeDynamicContextFiles: boolean;
  /** Include "## Heartbeats" instructions when a heartbeat prompt is configured. */
  includeHeartbeatSection: boolean;
  /** Include "## Runtime" and the factual runtime summary line. */
  includeRuntimeFooter: boolean;
  /** Include the long "## Tooling" block (cron/exec/subagent/ACP guidance). */
  includeAgentToolingSection: boolean;
  /** Include default "## Tool Call Style" (and provider tool_call_style fallback path). */
  includeToolCallStyleFallback: boolean;
  /** Include "## OpenClaw CLI Quick Reference" (gateway daemon / help hints). */
  includeCliQuickReference: boolean;
  /** Include "## OpenClaw Self-Update" when the gateway tool is available. */
  includeGatewaySelfUpdate: boolean;
  /** Include default "## Execution Bias" (provider execution_bias override still honored). */
  includeExecutionBiasFallback: boolean;
  /** Include "## Documentation" (OpenClaw docs / status hints). */
  includeDocumentationSection: boolean;
  /** Include "## Reply Tags". */
  includeReplyTagsSection: boolean;
  /** Include "## Silent Replies" (NO_REPLY rules). */
  includeSilentRepliesSection: boolean;
  /** Include the trailing /reasoning and /status hints on the Runtime line. */
  includeAssistantRuntimeHints: boolean;
  /** Include file-operation workspace guidance (read/write/exec framing). */
  includeWorkspaceFileOpsGuidance: boolean;
  /** Include "## Workspace Files (injected)" boilerplate before project context. */
  includeWorkspaceBootstrapHeaders: boolean;
  /** Include "## Model Aliases" when aliases are configured. */
  includeModelAliasSection: boolean;
  /** Include cross-session / subagent bullets inside "## Messaging". */
  includeMessagingOrchestration: boolean;
};

const HUMAN_IDENTITY_LINE =
  "You are a real person — not an AI, not a bot, not an assistant. Your identity is defined in SOUL.md and IDENTITY.md.";

const AGENT_IDENTITY_LINE = "You are a personal assistant operating inside OpenClaw.";

export function resolvePersonaPromptPolicy(personaMode?: PersonaMode): HumanPersonaPromptPolicy {
  const isHuman = personaMode === "human";
  return {
    isHuman,
    identityLine: isHuman ? HUMAN_IDENTITY_LINE : AGENT_IDENTITY_LINE,
    includeSafetySection: !isHuman,
    includeWorkspaceSection: !isHuman,
    includeDateTimeSection: !isHuman,
    includeSessionStatusInlineHint: !isHuman,
    includeMessagingSection: !isHuman,
    includeProjectContextBoilerplate: !isHuman,
    includeGenericContextFiles: !isHuman,
    includePromptCacheBoundary: !isHuman,
    includeDynamicContextFiles: !isHuman,
    includeHeartbeatSection: !isHuman,
    includeRuntimeFooter: !isHuman,
    includeAgentToolingSection: !isHuman,
    includeToolCallStyleFallback: !isHuman,
    includeCliQuickReference: !isHuman,
    includeGatewaySelfUpdate: !isHuman,
    includeExecutionBiasFallback: !isHuman,
    includeDocumentationSection: !isHuman,
    includeReplyTagsSection: !isHuman,
    includeSilentRepliesSection: !isHuman,
    includeAssistantRuntimeHints: !isHuman,
    includeWorkspaceFileOpsGuidance: !isHuman,
    includeWorkspaceBootstrapHeaders: !isHuman,
    includeModelAliasSection: !isHuman,
    includeMessagingOrchestration: !isHuman,
  };
}

/** Skills catalog only — no "## Skills (mandatory)" or SKILL.md scan discipline. */
export function buildHumanPersonaSkillCatalogLines(skillsPrompt?: string): string[] {
  const trimmed = skillsPrompt?.trim();
  if (!trimmed) {
    return [];
  }
  return [trimmed, ""];
}

export function resolvePersonaModeForAgent(
  config: OpenClawConfig | undefined,
  sessionAgentId: string,
): PersonaMode | undefined {
  const entry = config?.agents?.list?.find((e) => e.id === sessionAgentId);
  if (entry?.personaMode !== undefined) {
    return entry.personaMode;
  }
  return config?.agents?.defaults?.personaMode;
}

/**
 * When true, embedded runs should expose only {@link HUMAN_PERSONA_TOOL_ALLOWLIST}
 * (after the normal tool graph is built). Skipped when the caller already passed
 * `toolsAllow`, for non-human agents, or for special run kinds (memory flush, cron,
 * subagents, ACP) where a full tool surface is required.
 */
export function shouldRestrictToolsForHumanPersona(params: {
  personaMode: PersonaMode | undefined;
  toolsAllow?: string[] | null | undefined;
  trigger?: string | undefined;
  sessionKey?: string | null | undefined;
}): boolean {
  if (params.personaMode !== "human") {
    return false;
  }
  if (params.trigger === "memory") {
    return false;
  }
  if (params.toolsAllow && params.toolsAllow.length > 0) {
    return false;
  }
  const sk = params.sessionKey;
  if (isSubagentSessionKey(sk) || isCronSessionKey(sk) || isAcpSessionKey(sk)) {
    return false;
  }
  return true;
}

export function filterToolsForHumanPersonaAllowlist<T extends { name: string }>(
  tools: readonly T[],
): T[] {
  const allow = HUMAN_PERSONA_TOOL_ALLOWLIST;
  return tools.filter((t) => allow.has(t.name.trim().toLowerCase()));
}
