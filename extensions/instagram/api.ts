export type {
  ChannelAccountSnapshot,
  ChannelPlugin,
  OpenClawConfig,
  OpenClawPluginApi,
  PluginRuntime,
} from "openclaw/plugin-sdk/core";
export type { ReplyPayload } from "openclaw/plugin-sdk/reply-runtime";
export type { ResolvedInstagramAccount } from "./runtime-api.js";
export { instagramPlugin } from "./src/channel.js";
export { instagramSetupPlugin } from "./src/channel.setup.js";
