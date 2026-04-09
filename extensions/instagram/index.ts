import { defineBundledChannelEntry } from "openclaw/plugin-sdk/channel-entry-contract";

export default defineBundledChannelEntry({
  id: "instagram",
  name: "Instagram",
  description: "Instagram Messaging API channel plugin",
  importMetaUrl: import.meta.url,
  plugin: {
    specifier: "./api.js",
    exportName: "instagramPlugin",
  },
  runtime: {
    specifier: "./runtime-api.js",
    exportName: "setInstagramRuntime",
  },
});
