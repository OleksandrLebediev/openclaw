// Private runtime barrel for the bundled Instagram extension.
// Keep this barrel thin and aligned with the local extension surface.

export type {
  ChannelAccountSnapshot,
  ChannelPlugin,
  OpenClawConfig,
  OpenClawPluginApi,
  PluginRuntime,
} from "openclaw/plugin-sdk/core";
export type {
  ChannelGatewayContext,
  ChannelStatusIssue,
} from "openclaw/plugin-sdk/channel-contract";
export { clearAccountEntryFields } from "openclaw/plugin-sdk/core";
export { buildChannelConfigSchema } from "openclaw/plugin-sdk/channel-config-schema";
export type { ReplyPayload } from "openclaw/plugin-sdk/reply-runtime";
export type { ChannelSetupDmPolicy, ChannelSetupWizard } from "openclaw/plugin-sdk/setup";
export {
  buildComputedAccountStatusSnapshot,
  buildTokenChannelStatusSummary,
} from "openclaw/plugin-sdk/status-helpers";
export {
  DEFAULT_ACCOUNT_ID,
  formatDocsLink,
  setSetupChannelEnabled,
  splitSetupEntries,
} from "openclaw/plugin-sdk/setup";
export { setInstagramRuntime } from "./src/runtime.js";
export { sendInstagramMessage, getInstagramPageInfo } from "./src/send.js";
export { monitorInstagramProvider, startInstagramMonitor } from "./src/monitor.js";
export {
  resolveInstagramAccount,
  hasInstagramCredentials,
  listInstagramAccountIds,
} from "./src/accounts.js";
export type {
  InstagramConfig,
  InstagramProbeResult,
  ResolvedInstagramAccount,
  MetaWebhookPayload,
  MetaMessagingEvent,
} from "./src/types.js";
