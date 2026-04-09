import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk/account-id";
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-runtime";
import type { InstagramConfig, InstagramTokenSource, ResolvedInstagramAccount } from "./types.js";

export { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk/account-id";

export function normalizeAccountId(id: string): string {
  return (id ?? "default").toLowerCase().trim() || "default";
}

function resolveInstagramConfig(cfg: OpenClawConfig): InstagramConfig | undefined {
  return (cfg.channels as Record<string, unknown>)?.instagram as InstagramConfig | undefined;
}

function resolveAccessToken(igConfig: InstagramConfig | undefined): {
  token: string;
  source: InstagramTokenSource;
} {
  if (igConfig?.accessToken?.trim()) {
    return { token: igConfig.accessToken.trim(), source: "config" };
  }
  const envToken = process.env.INSTAGRAM_ACCESS_TOKEN?.trim();
  if (envToken) {
    return { token: envToken, source: "env" };
  }
  return { token: "", source: "none" };
}

export function resolveInstagramAccount(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): ResolvedInstagramAccount {
  const accountId = normalizeAccountId(params.accountId ?? DEFAULT_ACCOUNT_ID);
  const igConfig = resolveInstagramConfig(params.cfg);
  const baseEnabled = igConfig?.enabled !== false;
  const { token, source } = resolveAccessToken(igConfig);
  const appSecret = igConfig?.appSecret?.trim() ?? process.env.INSTAGRAM_APP_SECRET?.trim() ?? "";
  const webhookVerifyToken =
    igConfig?.webhookVerifyToken?.trim() ??
    process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN?.trim() ??
    "";

  return {
    accountId,
    name: igConfig?.name?.trim() || undefined,
    enabled: baseEnabled,
    accessToken: token,
    appSecret,
    webhookVerifyToken,
    tokenSource: source,
    config: igConfig ?? {},
  };
}

export function listInstagramAccountIds(_cfg: OpenClawConfig): string[] {
  return [DEFAULT_ACCOUNT_ID];
}

export function resolveDefaultInstagramAccountId(_cfg: OpenClawConfig): string {
  return DEFAULT_ACCOUNT_ID;
}

export function hasInstagramCredentials(account: ResolvedInstagramAccount): boolean {
  return account.tokenSource !== "none" && account.accessToken.length > 0;
}
