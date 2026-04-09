import { randomBytes } from "node:crypto";
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-runtime";
import type { ChannelSetupAdapter } from "openclaw/plugin-sdk/setup";
import {
  DEFAULT_ACCOUNT_ID,
  hasInstagramCredentials,
  normalizeAccountId,
  resolveInstagramAccount,
} from "./accounts.js";
import type { InstagramConfig } from "./types.js";

export { DEFAULT_ACCOUNT_ID, hasInstagramCredentials, normalizeAccountId, resolveInstagramAccount };

export function generateWebhookVerifyToken(): string {
  return randomBytes(20).toString("hex");
}

export function patchInstagramConfig(params: {
  cfg: OpenClawConfig;
  accountId: string;
  patch: Record<string, unknown>;
  clearFields?: string[];
  enabled?: boolean;
}): OpenClawConfig {
  const igConfig = ((params.cfg.channels as Record<string, unknown>)?.instagram ??
    {}) as InstagramConfig;
  const clearFields = params.clearFields ?? [];

  const nextIg = { ...igConfig } as Record<string, unknown>;
  for (const field of clearFields) {
    delete nextIg[field];
  }

  return {
    ...params.cfg,
    channels: {
      ...params.cfg.channels,
      instagram: {
        ...nextIg,
        ...(params.enabled ? { enabled: true } : {}),
        ...params.patch,
      },
    } as OpenClawConfig["channels"],
  };
}

export function isInstagramConfigured(cfg: OpenClawConfig, accountId: string): boolean {
  const account = resolveInstagramAccount({ cfg, accountId });
  return hasInstagramCredentials(account) && Boolean(account.webhookVerifyToken);
}

export const instagramSetupAdapter: ChannelSetupAdapter = {
  resolveAccountId: ({ accountId }) => normalizeAccountId(accountId ?? DEFAULT_ACCOUNT_ID),

  applyAccountName: ({ cfg, accountId, name }) =>
    patchInstagramConfig({
      cfg,
      accountId,
      patch: name?.trim() ? { name: name.trim() } : {},
    }),

  applyAccountConfig: ({ cfg, accountId, input }) => {
    const typedInput = input as {
      useEnv?: boolean;
      accessToken?: string;
      token?: string; // app secret
      webhookVerifyToken?: string;
    };

    const normalizedId = normalizeAccountId(accountId ?? DEFAULT_ACCOUNT_ID);
    const currentAccount = resolveInstagramAccount({ cfg, accountId: normalizedId });

    // Auto-generate webhook verify token if not already set
    const existingVerifyToken = currentAccount.webhookVerifyToken;
    const verifyToken = existingVerifyToken || generateWebhookVerifyToken();

    const patch: Record<string, unknown> = { webhookVerifyToken: verifyToken };

    if (typedInput.useEnv) {
      return patchInstagramConfig({
        cfg,
        accountId: normalizedId,
        enabled: true,
        clearFields: ["accessToken", "appSecret"],
        patch,
      });
    }

    if (typedInput.accessToken?.trim()) {
      patch.accessToken = typedInput.accessToken.trim();
    }
    if (typedInput.token?.trim()) {
      patch.appSecret = typedInput.token.trim();
    }

    return patchInstagramConfig({
      cfg,
      accountId: normalizedId,
      enabled: true,
      patch,
    });
  },
};
