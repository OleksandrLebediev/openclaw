import {
  createAllowFromSection,
  createStandardChannelSetupStatus,
  mergeAllowFromEntries,
  splitSetupEntries,
  setSetupChannelEnabled,
  formatDocsLink,
  type ChannelSetupWizard,
  type ChannelSetupDmPolicy,
} from "openclaw/plugin-sdk/setup";
import {
  DEFAULT_ACCOUNT_ID,
  generateWebhookVerifyToken,
  hasInstagramCredentials,
  isInstagramConfigured,
  patchInstagramConfig,
  resolveInstagramAccount,
} from "./setup-core.js";

export { instagramSetupAdapter } from "./setup-core.js";

const channel = "instagram" as const;

const INSTAGRAM_SETUP_HELP_LINES = [
  "1) Open Meta Developer Portal (developers.facebook.com)",
  "2) Create or open an app > Add Instagram product",
  "3) Connect your Instagram Business or Creator account",
  "4) Get a Page Access Token (System User or User Token)",
  "5) Copy your App Secret from App Settings > Basic",
  "6) Configure the webhook URL and verify token shown at the end of this setup",
  `Docs: ${formatDocsLink("/channels/instagram", "channels/instagram")}`,
];

const INSTAGRAM_ALLOW_FROM_HELP_LINES = [
  "Allowlist Instagram DMs by Instagram-scoped user ID (IGSID).",
  "Example: instagram:1234567890",
  "Multiple entries: comma-separated.",
  `Docs: ${formatDocsLink("/channels/instagram", "channels/instagram")}`,
];

const instagramDmPolicy: ChannelSetupDmPolicy = {
  label: "Instagram",
  channel,
  policyKey: "channels.instagram.dmPolicy",
  allowFromKey: "channels.instagram.allowFrom",
  resolveConfigKeys: (_cfg, _accountId) => ({
    policyKey: "channels.instagram.dmPolicy",
    allowFromKey: "channels.instagram.allowFrom",
  }),
  getCurrent: (cfg, accountId) =>
    resolveInstagramAccount({ cfg, accountId: accountId ?? DEFAULT_ACCOUNT_ID }).config.dmPolicy ??
    "pairing",
  setPolicy: (cfg, policy, accountId) =>
    patchInstagramConfig({
      cfg,
      accountId: accountId ?? DEFAULT_ACCOUNT_ID,
      enabled: true,
      patch:
        policy === "open"
          ? {
              dmPolicy: "open",
              allowFrom: mergeAllowFromEntries(
                resolveInstagramAccount({ cfg, accountId: accountId ?? DEFAULT_ACCOUNT_ID }).config
                  .allowFrom,
                ["*"],
              ),
            }
          : { dmPolicy: policy },
      clearFields: policy === "pairing" || policy === "disabled" ? ["allowFrom"] : undefined,
    }),
};

export const instagramSetupWizard: ChannelSetupWizard = {
  channel,
  status: createStandardChannelSetupStatus({
    channelLabel: "Instagram",
    configuredLabel: "configured",
    unconfiguredLabel: "needs access token + verify token",
    configuredHint: "configured",
    unconfiguredHint: "needs access token",
    configuredScore: 1,
    unconfiguredScore: 0,
    includeStatusLine: true,
    resolveConfigured: ({ cfg, accountId }) =>
      isInstagramConfigured(cfg, accountId ?? DEFAULT_ACCOUNT_ID),
  }),
  introNote: {
    title: "Instagram Messaging API",
    lines: INSTAGRAM_SETUP_HELP_LINES,
    shouldShow: ({ cfg, accountId }) =>
      !isInstagramConfigured(cfg, accountId ?? DEFAULT_ACCOUNT_ID),
  },
  credentials: [
    {
      inputKey: "accessToken",
      providerHint: channel,
      credentialLabel: "Page Access Token",
      preferredEnvVar: "INSTAGRAM_ACCESS_TOKEN",
      helpTitle: "Instagram Page Access Token",
      helpLines: INSTAGRAM_SETUP_HELP_LINES,
      envPrompt: "INSTAGRAM_ACCESS_TOKEN detected. Use env var?",
      keepPrompt: "Instagram access token already configured. Keep it?",
      inputPrompt: "Enter Instagram Page Access Token",
      allowEnv: ({ accountId }) => accountId === DEFAULT_ACCOUNT_ID,
      inspect: ({ cfg, accountId }) => {
        const resolved = resolveInstagramAccount({ cfg, accountId });
        return {
          accountConfigured: hasInstagramCredentials(resolved),
          hasConfiguredValue: Boolean(resolved.config.accessToken?.trim()),
          resolvedValue: resolved.accessToken || undefined,
          envValue:
            accountId === DEFAULT_ACCOUNT_ID
              ? process.env.INSTAGRAM_ACCESS_TOKEN?.trim() || undefined
              : undefined,
        };
      },
      applyUseEnv: ({ cfg, accountId }) =>
        patchInstagramConfig({
          cfg,
          accountId,
          enabled: true,
          clearFields: ["accessToken"],
          patch: {},
        }),
      applySet: ({ cfg, accountId, resolvedValue }) =>
        patchInstagramConfig({
          cfg,
          accountId,
          enabled: true,
          patch: { accessToken: resolvedValue },
        }),
    },
    {
      inputKey: "token",
      providerHint: "instagram-app-secret",
      credentialLabel: "App Secret",
      preferredEnvVar: "INSTAGRAM_APP_SECRET",
      helpTitle: "Instagram App Secret",
      helpLines: [
        "Found in Meta Developer Portal > Your App > App Settings > Basic.",
        "Used to validate the X-Hub-Signature-256 signature on incoming webhook events.",
        "Optional but strongly recommended for security.",
        `Docs: ${formatDocsLink("/channels/instagram", "channels/instagram")}`,
      ],
      envPrompt: "INSTAGRAM_APP_SECRET detected. Use env var?",
      keepPrompt: "Instagram App Secret already configured. Keep it?",
      inputPrompt: "Enter Instagram App Secret (optional, for webhook signature validation)",
      allowEnv: ({ accountId }) => accountId === DEFAULT_ACCOUNT_ID,
      inspect: ({ cfg, accountId }) => {
        const resolved = resolveInstagramAccount({ cfg, accountId });
        return {
          accountConfigured: hasInstagramCredentials(resolved),
          hasConfiguredValue: Boolean(resolved.config.appSecret?.trim()),
          resolvedValue: resolved.appSecret || undefined,
          envValue:
            accountId === DEFAULT_ACCOUNT_ID
              ? process.env.INSTAGRAM_APP_SECRET?.trim() || undefined
              : undefined,
        };
      },
      applyUseEnv: ({ cfg, accountId }) =>
        patchInstagramConfig({
          cfg,
          accountId,
          enabled: true,
          clearFields: ["appSecret"],
          patch: {},
        }),
      applySet: ({ cfg, accountId, resolvedValue }) =>
        patchInstagramConfig({
          cfg,
          accountId,
          enabled: true,
          patch: { appSecret: resolvedValue },
        }),
    },
  ],
  prepare: ({ cfg, accountId }) => {
    // Auto-generate webhook verify token on first setup if not already configured
    const resolved = resolveInstagramAccount({ cfg, accountId });
    if (!resolved.webhookVerifyToken) {
      const verifyToken = generateWebhookVerifyToken();
      return {
        cfg: patchInstagramConfig({
          cfg,
          accountId,
          patch: { webhookVerifyToken: verifyToken },
        }),
      };
    }
    return undefined;
  },
  allowFrom: createAllowFromSection({
    helpTitle: "Instagram allowlist",
    helpLines: INSTAGRAM_ALLOW_FROM_HELP_LINES,
    message: "Instagram allowFrom (user ID)",
    placeholder: "1234567890",
    invalidWithoutCredentialNote: "Instagram allowFrom requires Instagram-scoped user IDs (IGSID).",
    parseInputs: splitSetupEntries,
    parseId: (raw) => {
      const stripped = raw.replace(/^instagram:/i, "").trim();
      return /^\d+$/.test(stripped) ? stripped : null;
    },
    apply: ({ cfg, accountId, allowFrom }) =>
      patchInstagramConfig({
        cfg,
        accountId,
        enabled: true,
        patch: { dmPolicy: "allowlist", allowFrom },
      }),
  }),
  dmPolicy: instagramDmPolicy,
  completionNote: {
    title: "Instagram webhook setup",
    lines: [
      "In the Meta Developer Portal, configure your webhook:",
      "  • Callback URL: https://<your-gateway-host>/instagram/webhook",
      "  • Verify Token: (shown above — was auto-generated)",
      "  • Subscribe to: messages, messaging_postbacks",
      "Your gateway must be publicly accessible for Meta to reach the webhook.",
      `Docs: ${formatDocsLink("/channels/instagram", "channels/instagram")}`,
    ],
  },
  disable: (cfg) => setSetupChannelEnabled(cfg, channel, false),
};
