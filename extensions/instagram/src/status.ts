import type { ChannelPlugin } from "openclaw/plugin-sdk/core";
import {
  buildTokenChannelStatusSummary,
  createComputedAccountStatusAdapter,
  createDefaultChannelRuntimeState,
} from "openclaw/plugin-sdk/status-helpers";
import { hasInstagramCredentials } from "./accounts.js";
import { DEFAULT_ACCOUNT_ID } from "./accounts.js";
import type { ResolvedInstagramAccount } from "./types.js";

export const instagramStatusAdapter: NonNullable<
  ChannelPlugin<ResolvedInstagramAccount>["status"]
> = createComputedAccountStatusAdapter<ResolvedInstagramAccount>({
  defaultRuntime: createDefaultChannelRuntimeState(DEFAULT_ACCOUNT_ID),
  buildChannelSummary: ({ snapshot }) => buildTokenChannelStatusSummary(snapshot),
  resolveAccountSnapshot: ({ account }) => ({
    accountId: account.accountId,
    name: account.name,
    enabled: account.enabled,
    configured: hasInstagramCredentials(account) && Boolean(account.webhookVerifyToken),
    extra: {
      tokenSource: account.tokenSource,
      mode: "webhook",
    },
  }),
});
