import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";
import type { PluginRuntime } from "../api.js";

type InstagramChannelRuntime = {
  monitorInstagramProvider?: typeof import("./monitor.js").monitorInstagramProvider;
  sendInstagramMessage?: typeof import("./send.js").sendInstagramMessage;
  resolveInstagramAccount?: typeof import("./accounts.js").resolveInstagramAccount;
};

export type InstagramRuntime = PluginRuntime & {
  channel: PluginRuntime["channel"] & {
    instagram?: InstagramChannelRuntime;
  };
};

const {
  setRuntime: setInstagramRuntime,
  clearRuntime: clearInstagramRuntime,
  getRuntime: getInstagramRuntime,
} = createPluginRuntimeStore<InstagramRuntime>(
  "Instagram runtime not initialized - plugin not registered",
);

export { clearInstagramRuntime, getInstagramRuntime, setInstagramRuntime };
