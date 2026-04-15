/**
 * Human persona (`personaMode: "human"`) tweaks to the embedded system prompt.
 * Which tools the model may call is governed by the same `agents.*.tools`
 * profile / allowlists as agent mode (`createOpenClawCodingTools` policy pipeline);
 * this module does not impose an extra hardcoded tool surface.
 *
 * Orchestrator / product scaffolding (tooling prose, CLI self-service, mandatory
 * skills discipline, gateway self-update) is gated here so `system-prompt.ts`
 * stays a single assembly pipeline with explicit persona policy.
 */

import type { OpenClawConfig } from "../config/config.js";

export type PersonaMode = "agent" | "human";

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
