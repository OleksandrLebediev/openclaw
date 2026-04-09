import { createChatChannelPlugin } from "openclaw/plugin-sdk/channel-core";
import { createPairingPrefixStripper } from "openclaw/plugin-sdk/channel-pairing";
import { createRestrictSendersChannelSecurity } from "openclaw/plugin-sdk/channel-policy";
import { createEmptyChannelDirectoryAdapter } from "openclaw/plugin-sdk/directory-runtime";
import type { ChannelPlugin, ResolvedInstagramAccount } from "../api.js";
import { resolveInstagramAccount } from "./accounts.js";
import { instagramChannelPluginCommon } from "./channel-shared.js";
import { instagramGatewayAdapter } from "./gateway.js";
import { instagramOutboundAdapter } from "./outbound.js";
import { getInstagramRuntime } from "./runtime.js";
import { sendInstagramMessage } from "./send.js";
import { instagramSetupAdapter } from "./setup-core.js";
import { instagramSetupWizard } from "./setup-surface.js";
import { instagramStatusAdapter } from "./status.js";

function normalizeInstagramId(raw?: string | null): string | null {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) {
    return null;
  }
  return trimmed.replace(/^instagram:/i, "").trim() || null;
}

function resolveInstagramCommandConversation(params: {
  originatingTo?: string;
  commandTo?: string;
  fallbackTo?: string;
}) {
  const conversationId =
    normalizeInstagramId(params.originatingTo) ??
    normalizeInstagramId(params.commandTo) ??
    normalizeInstagramId(params.fallbackTo);
  return conversationId ? { conversationId } : null;
}

function resolveInstagramInboundConversation(params: { to?: string; conversationId?: string }) {
  const conversationId =
    normalizeInstagramId(params.conversationId) ?? normalizeInstagramId(params.to);
  return conversationId ? { conversationId } : null;
}

const instagramSecurityAdapter = createRestrictSendersChannelSecurity<ResolvedInstagramAccount>({
  channelKey: "instagram",
  resolveDmPolicy: (account) => account.config.dmPolicy,
  resolveDmAllowFrom: (account) => account.config.allowFrom,
  resolveGroupPolicy: () => "disabled",
  surface: "Instagram DMs",
  openScope: "any Instagram DM",
  groupPolicyPath: "channels.instagram.groupPolicy",
  groupAllowFromPath: "channels.instagram.groupAllowFrom",
  mentionGated: false,
  policyPathSuffix: "dmPolicy",
  approveHint: "openclaw pairing approve instagram <code>",
  normalizeDmEntry: (raw) => raw.replace(/^instagram:/i, ""),
});

export const instagramPlugin: ChannelPlugin<ResolvedInstagramAccount> = createChatChannelPlugin({
  base: {
    id: "instagram",
    ...instagramChannelPluginCommon,
    setupWizard: instagramSetupWizard,
    messaging: {
      normalizeTarget: (target) => {
        const trimmed = target.trim();
        if (!trimmed) {
          return undefined;
        }
        return trimmed.replace(/^instagram:/i, "");
      },
      resolveInboundConversation: ({ to, conversationId }) =>
        resolveInstagramInboundConversation({ to, conversationId }),
      targetResolver: {
        looksLikeId: (id) => {
          const trimmed = id?.trim();
          if (!trimmed) {
            return false;
          }
          return /^\d+$/.test(trimmed) || /^instagram:/i.test(trimmed);
        },
        hint: "<instagramScopedUserId>",
      },
    },
    directory: createEmptyChannelDirectoryAdapter(),
    setup: instagramSetupAdapter,
    status: instagramStatusAdapter,
    gateway: instagramGatewayAdapter,
    bindings: {
      compileConfiguredBinding: ({ conversationId }) => {
        const normalized = normalizeInstagramId(conversationId);
        return normalized ? { conversationId: normalized } : null;
      },
      matchInboundConversation: ({ compiledBinding, conversationId }) => {
        const normalizedIncoming = normalizeInstagramId(conversationId);
        if (!normalizedIncoming || compiledBinding.conversationId !== normalizedIncoming) {
          return null;
        }
        return {
          conversationId: normalizedIncoming,
          matchPriority: 2,
        };
      },
      resolveCommandConversation: ({ originatingTo, commandTo, fallbackTo }) =>
        resolveInstagramCommandConversation({
          originatingTo,
          commandTo,
          fallbackTo,
        }),
    },
    conversationBindings: {
      defaultTopLevelPlacement: "current",
    },
  },
  pairing: {
    text: {
      idLabel: "instagramUserId",
      message: "OpenClaw: your access has been approved.",
      normalizeAllowEntry: createPairingPrefixStripper(/^instagram:/i),
      notify: async ({ cfg, id, message }) => {
        const account = resolveInstagramAccount({ cfg });
        if (!account.accessToken) {
          throw new Error("Instagram access token not configured");
        }
        const runtime = getInstagramRuntime();
        const send = runtime.channel.instagram?.sendInstagramMessage ?? sendInstagramMessage;
        await send({
          accessToken: account.accessToken,
          recipientId: id,
          text: message,
        });
      },
    },
  },
  security: instagramSecurityAdapter,
  outbound: instagramOutboundAdapter,
});
