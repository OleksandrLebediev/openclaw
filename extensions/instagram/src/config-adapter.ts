import { createScopedChannelConfigAdapter } from "openclaw/plugin-sdk/channel-config-helpers";
import {
  listInstagramAccountIds,
  resolveDefaultInstagramAccountId,
  resolveInstagramAccount,
} from "./accounts.js";
import type { ResolvedInstagramAccount } from "./types.js";

export const instagramConfigAdapter = createScopedChannelConfigAdapter<
  ResolvedInstagramAccount,
  ResolvedInstagramAccount
>({
  sectionKey: "instagram",
  listAccountIds: listInstagramAccountIds,
  resolveAccount: (cfg, accountId) =>
    resolveInstagramAccount({ cfg, accountId: accountId ?? undefined }),
  defaultAccountId: resolveDefaultInstagramAccountId,
  clearBaseFields: ["appSecret", "webhookVerifyToken"],
  resolveAllowFrom: (account) => account.config.allowFrom,
  formatAllowFrom: (allowFrom) => allowFrom.map((entry) => String(entry).trim()).filter(Boolean),
});
