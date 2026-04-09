import { describeWebhookAccountSnapshot } from "openclaw/plugin-sdk/account-helpers";
import type { ChannelPlugin, OpenClawConfig } from "openclaw/plugin-sdk/core";
import { hasInstagramCredentials, resolveInstagramAccount } from "./accounts.js";
import { instagramConfigAdapter } from "./config-adapter.js";
import { InstagramChannelConfigSchema } from "./config-schema.js";
import type { ResolvedInstagramAccount } from "./types.js";

export const instagramChannelMeta = {
  id: "instagram",
  label: "Instagram",
  selectionLabel: "Instagram (Messaging API)",
  detailLabel: "Instagram DM Bot",
  docsPath: "/channels/instagram",
  docsLabel: "instagram",
  blurb: "Instagram DMs via Meta Messaging API — requires a Business or Creator account.",
  systemImage: "camera",
} as const;

export const instagramChannelPluginCommon = {
  meta: {
    ...instagramChannelMeta,
    quickstartAllowFrom: true,
  },
  capabilities: {
    chatTypes: ["direct"] as const,
    reactions: false,
    threads: false,
    media: true,
    nativeCommands: false,
    blockStreaming: true,
  },
  reload: { configPrefixes: ["channels.instagram"] },
  configSchema: InstagramChannelConfigSchema,
  config: {
    ...instagramConfigAdapter,
    isConfigured: (account: ResolvedInstagramAccount) =>
      hasInstagramCredentials(account) && Boolean(account.webhookVerifyToken),
    describeAccount: (account: ResolvedInstagramAccount) =>
      describeWebhookAccountSnapshot({
        account,
        configured: hasInstagramCredentials(account),
        extra: {
          tokenSource: account.tokenSource ?? undefined,
        },
      }),
  },
} satisfies Pick<
  ChannelPlugin<ResolvedInstagramAccount>,
  "meta" | "capabilities" | "reload" | "configSchema" | "config"
>;

export function isInstagramConfigured(cfg: OpenClawConfig, accountId: string): boolean {
  return (
    hasInstagramCredentials(resolveInstagramAccount({ cfg, accountId })) &&
    Boolean(resolveInstagramAccount({ cfg, accountId }).webhookVerifyToken)
  );
}
