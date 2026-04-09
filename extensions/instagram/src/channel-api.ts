// Internal type barrel — keeps channel.ts imports clean.
export type {
  ChannelPlugin,
  OpenClawConfig,
  OpenClawPluginApi,
  PluginRuntime,
} from "openclaw/plugin-sdk/core";
export { clearAccountEntryFields, emptyPluginConfigSchema } from "openclaw/plugin-sdk/core";
export { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk/account-id";
export type {
  ResolvedInstagramAccount,
  InstagramConfig,
  MetaMessagingEvent,
  MetaWebhookPayload,
} from "./types.js";
