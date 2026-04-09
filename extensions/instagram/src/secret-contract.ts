import type {
  ResolverContext,
  SecretDefaults,
  SecretTargetRegistryEntry,
} from "openclaw/plugin-sdk/channel-secret-runtime";
import {
  collectConditionalChannelFieldAssignments,
  getChannelSurface,
} from "openclaw/plugin-sdk/channel-secret-runtime";

export const secretTargetRegistryEntries = [
  {
    id: "channels.instagram.accessToken",
    targetType: "channels.instagram.accessToken",
    configFile: "openclaw.json",
    pathPattern: "channels.instagram.accessToken",
    secretShape: "secret_input",
    expectedResolvedValue: "string",
    includeInPlan: true,
    includeInConfigure: true,
    includeInAudit: true,
  },
  {
    id: "channels.instagram.appSecret",
    targetType: "channels.instagram.appSecret",
    configFile: "openclaw.json",
    pathPattern: "channels.instagram.appSecret",
    secretShape: "secret_input",
    expectedResolvedValue: "string",
    includeInPlan: true,
    includeInConfigure: true,
    includeInAudit: true,
  },
] satisfies SecretTargetRegistryEntry[];

export function collectRuntimeConfigAssignments(params: {
  config: { channels?: Record<string, unknown> };
  defaults: SecretDefaults | undefined;
  context: ResolverContext;
}): void {
  const resolved = getChannelSurface(params.config, "instagram");
  if (!resolved) {
    return;
  }
  const { channel: instagram, surface } = resolved;
  collectConditionalChannelFieldAssignments({
    channelKey: "instagram",
    field: "accessToken",
    channel: instagram,
    surface,
    defaults: params.defaults,
    context: params.context,
    topLevelActiveWithoutAccounts: true,
    topLevelInheritedAccountActive: ({ enabled }) => enabled,
    accountActive: ({ enabled }) => enabled,
    topInactiveReason: "Instagram channel is not configured.",
    accountInactiveReason: "Instagram account is disabled.",
  });
}

export const channelSecrets = {
  secretTargetRegistryEntries,
  collectRuntimeConfigAssignments,
};
