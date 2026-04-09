import type { ChannelPlugin, ResolvedInstagramAccount } from "../api.js";
import { instagramChannelPluginCommon } from "./channel-shared.js";
import { instagramSetupAdapter } from "./setup-core.js";
import { instagramSetupWizard } from "./setup-surface.js";

export const instagramSetupPlugin: ChannelPlugin<ResolvedInstagramAccount> = {
  id: "instagram",
  ...instagramChannelPluginCommon,
  setupWizard: instagramSetupWizard,
  setup: instagramSetupAdapter,
};
