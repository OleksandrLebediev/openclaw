import {
  createAttachedChannelResultAdapter,
  createEmptyChannelResult,
} from "openclaw/plugin-sdk/channel-send-result";
import { createLazyRuntimeModule } from "openclaw/plugin-sdk/lazy-runtime";
import type { ChannelPlugin, ResolvedInstagramAccount } from "../api.js";
import { resolveInstagramAccount } from "./accounts.js";

const loadOutboundRuntime = createLazyRuntimeModule(() => import("./send.js"));

export const instagramOutboundAdapter: NonNullable<
  ChannelPlugin<ResolvedInstagramAccount>["outbound"]
> = {
  // Messages are dispatched via gateway.startAccount webhook monitor, not direct send.
  deliveryMode: "gateway",
  sendPayload: async ({ cfg, to, text, accountId }) => {
    const { sendInstagramMessage } = await loadOutboundRuntime();
    const account = resolveInstagramAccount({ cfg, accountId });
    const sendText = text?.trim() ?? "";
    if (!sendText) {
      return createEmptyChannelResult("instagram", { chatId: to });
    }
    const result = await sendInstagramMessage({
      accessToken: account.accessToken,
      recipientId: to,
      text: sendText,
    });
    return createEmptyChannelResult("instagram", {
      messageId: result.messageId,
      chatId: to,
    });
  },
  ...createAttachedChannelResultAdapter({
    channel: "instagram",
    sendText: async ({ cfg, to, text, accountId }) => {
      const { sendInstagramMessage } = await loadOutboundRuntime();
      const account = resolveInstagramAccount({ cfg, accountId });
      const result = await sendInstagramMessage({
        accessToken: account.accessToken,
        recipientId: to,
        text,
      });
      return {
        messageId: result.messageId,
        chatId: to,
      };
    },
  }),
};
