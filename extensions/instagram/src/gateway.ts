import type { OpenClawConfig } from "openclaw/plugin-sdk/config-runtime";
import type { ChannelPlugin } from "openclaw/plugin-sdk/core";
import { createLazyRuntimeModule } from "openclaw/plugin-sdk/lazy-runtime";
import { resolveInstagramAccount, DEFAULT_ACCOUNT_ID } from "./accounts.js";
import type { ResolvedInstagramAccount, InstagramConfig } from "./types.js";

const loadInstagramMonitorRuntime = createLazyRuntimeModule(() => import("./monitor.js"));

export const instagramGatewayAdapter: NonNullable<
  ChannelPlugin<ResolvedInstagramAccount>["gateway"]
> = {
  startAccount: async (ctx) => {
    const account = ctx.account;

    if (!account.accessToken.trim()) {
      throw new Error(
        `Instagram requires a non-empty access token for account "${account.accountId}". ` +
          "Set channels.instagram.accessToken in your config or INSTAGRAM_ACCESS_TOKEN env var.",
      );
    }

    if (!account.webhookVerifyToken.trim()) {
      throw new Error(
        `Instagram requires a webhookVerifyToken for account "${account.accountId}". ` +
          "Set channels.instagram.webhookVerifyToken in your config or INSTAGRAM_WEBHOOK_VERIFY_TOKEN env var.",
      );
    }

    ctx.log?.info(`[${account.accountId}] starting Instagram webhook`);

    const { startInstagramMonitor } = await loadInstagramMonitorRuntime();

    await startInstagramMonitor({
      account,
      config: ctx.cfg,
      runtime: ctx.runtime,
      abortSignal: ctx.abortSignal,
      webhookPath: account.config.webhookPath,
    });
  },

  logoutAccount: async ({ accountId, cfg }) => {
    const envToken = process.env.INSTAGRAM_ACCESS_TOKEN?.trim() ?? "";
    const nextCfg = { ...cfg } as OpenClawConfig;
    const igConfig = ((cfg.channels as Record<string, unknown>)?.instagram ??
      {}) as InstagramConfig;
    const nextIg = { ...igConfig };
    let cleared = false;
    let changed = false;

    if (accountId === DEFAULT_ACCOUNT_ID) {
      if (nextIg.accessToken || nextIg.appSecret || nextIg.webhookVerifyToken) {
        delete nextIg.accessToken;
        delete nextIg.appSecret;
        delete nextIg.webhookVerifyToken;
        cleared = true;
        changed = true;
      }
    }

    if (changed) {
      if (Object.keys(nextIg).length > 0) {
        nextCfg.channels = {
          ...nextCfg.channels,
          instagram: nextIg,
        } as OpenClawConfig["channels"];
      } else {
        const nextChannels = { ...nextCfg.channels } as Record<string, unknown>;
        delete nextChannels.instagram;
        if (Object.keys(nextChannels).length > 0) {
          nextCfg.channels = nextChannels as OpenClawConfig["channels"];
        } else {
          delete nextCfg.channels;
        }
      }
    }

    const resolved = resolveInstagramAccount({
      cfg: changed ? nextCfg : cfg,
      accountId,
    });
    const loggedOut = resolved.tokenSource === "none";

    return { cleared, envToken: Boolean(envToken), loggedOut };
  },
};
