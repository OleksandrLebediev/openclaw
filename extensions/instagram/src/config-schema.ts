import { buildChannelConfigSchema } from "openclaw/plugin-sdk/channel-config-schema";
import { z } from "openclaw/plugin-sdk/zod";

const DmPolicySchema = z.enum(["open", "allowlist", "pairing", "disabled"]);

const InstagramCommonConfigSchema = z.object({
  enabled: z.boolean().optional(),
  accessToken: z.string().optional(),
  appSecret: z.string().optional(),
  webhookVerifyToken: z.string().optional(),
  webhookPath: z.string().optional(),
  name: z.string().optional(),
  allowFrom: z.array(z.union([z.string(), z.number()])).optional(),
  dmPolicy: DmPolicySchema.optional().default("pairing"),
});

export const InstagramConfigSchema = InstagramCommonConfigSchema.strict();

export const InstagramChannelConfigSchema = buildChannelConfigSchema(InstagramConfigSchema);

export type InstagramConfigSchemaType = z.infer<typeof InstagramConfigSchema>;
