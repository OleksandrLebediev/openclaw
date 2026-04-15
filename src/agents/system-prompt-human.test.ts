import { describe, expect, it } from "vitest";
import {
  buildHumanPersonaSkillCatalogLines,
  resolvePersonaModeForAgent,
  resolvePersonaPromptPolicy,
} from "./system-prompt-human.js";

describe("resolvePersonaPromptPolicy", () => {
  it("disables agent scaffold flags for human persona", () => {
    const p = resolvePersonaPromptPolicy("human");
    expect(p.isHuman).toBe(true);
    expect(p.identityLine).toContain("real person");
    expect(p.includeAgentToolingSection).toBe(false);
    expect(p.includeToolCallStyleFallback).toBe(false);
    expect(p.includeCliQuickReference).toBe(false);
    expect(p.includeGatewaySelfUpdate).toBe(false);
    expect(p.includeExecutionBiasFallback).toBe(false);
    expect(p.includeDocumentationSection).toBe(false);
    expect(p.includeReplyTagsSection).toBe(false);
    expect(p.includeSilentRepliesSection).toBe(false);
    expect(p.includeAssistantRuntimeHints).toBe(false);
    expect(p.includeWorkspaceFileOpsGuidance).toBe(false);
    expect(p.includeWorkspaceBootstrapHeaders).toBe(false);
    expect(p.includeModelAliasSection).toBe(false);
    expect(p.includeMessagingOrchestration).toBe(false);
    expect(p.includeSafetySection).toBe(false);
    expect(p.includeWorkspaceSection).toBe(false);
    expect(p.includeDateTimeSection).toBe(false);
    expect(p.includeSessionStatusInlineHint).toBe(false);
    expect(p.includeMessagingSection).toBe(false);
    expect(p.includeProjectContextBoilerplate).toBe(false);
    expect(p.includeGenericContextFiles).toBe(false);
    expect(p.includePromptCacheBoundary).toBe(false);
    expect(p.includeDynamicContextFiles).toBe(false);
    expect(p.includeHeartbeatSection).toBe(false);
    expect(p.includeRuntimeFooter).toBe(false);
  });

  it("enables agent scaffold flags for agent or unset", () => {
    for (const mode of ["agent", undefined] as const) {
      const p = resolvePersonaPromptPolicy(mode);
      expect(p.isHuman).toBe(false);
      expect(p.identityLine).toContain("personal assistant");
      expect(p.includeAgentToolingSection).toBe(true);
      expect(p.includeToolCallStyleFallback).toBe(true);
      expect(p.includeCliQuickReference).toBe(true);
      expect(p.includeGatewaySelfUpdate).toBe(true);
      expect(p.includeExecutionBiasFallback).toBe(true);
      expect(p.includeDocumentationSection).toBe(true);
      expect(p.includeReplyTagsSection).toBe(true);
      expect(p.includeSilentRepliesSection).toBe(true);
      expect(p.includeAssistantRuntimeHints).toBe(true);
      expect(p.includeWorkspaceFileOpsGuidance).toBe(true);
      expect(p.includeWorkspaceBootstrapHeaders).toBe(true);
      expect(p.includeModelAliasSection).toBe(true);
      expect(p.includeMessagingOrchestration).toBe(true);
      expect(p.includeSafetySection).toBe(true);
      expect(p.includeWorkspaceSection).toBe(true);
      expect(p.includeDateTimeSection).toBe(true);
      expect(p.includeSessionStatusInlineHint).toBe(true);
      expect(p.includeMessagingSection).toBe(true);
      expect(p.includeProjectContextBoilerplate).toBe(true);
      expect(p.includeGenericContextFiles).toBe(true);
      expect(p.includePromptCacheBoundary).toBe(true);
      expect(p.includeDynamicContextFiles).toBe(true);
      expect(p.includeHeartbeatSection).toBe(true);
      expect(p.includeRuntimeFooter).toBe(true);
    }
  });
});

describe("resolvePersonaModeForAgent", () => {
  it("prefers per-agent personaMode over defaults", () => {
    expect(
      resolvePersonaModeForAgent(
        {
          agents: {
            defaults: { personaMode: "agent" },
            list: [{ id: "lilu", personaMode: "human" }],
          },
        } as never,
        "lilu",
      ),
    ).toBe("human");
  });

  it("falls back to defaults when agent entry has no personaMode", () => {
    expect(
      resolvePersonaModeForAgent(
        {
          agents: {
            defaults: { personaMode: "human" },
            list: [{ id: "main" }],
          },
        } as never,
        "main",
      ),
    ).toBe("human");
  });
});

describe("buildHumanPersonaSkillCatalogLines", () => {
  it("returns empty array when no skills prompt", () => {
    expect(buildHumanPersonaSkillCatalogLines(undefined)).toEqual([]);
    expect(buildHumanPersonaSkillCatalogLines("   ")).toEqual([]);
  });

  it("returns catalog lines without mandatory heading", () => {
    const lines = buildHumanPersonaSkillCatalogLines("<available_skills></available_skills>");
    expect(lines).toEqual(["<available_skills></available_skills>", ""]);
    expect(lines.join("\n")).not.toContain("## Skills (mandatory)");
  });
});
