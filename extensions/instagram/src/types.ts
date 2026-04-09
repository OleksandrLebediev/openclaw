import type { BaseProbeResult } from "openclaw/plugin-sdk/channel-contract";

export type InstagramTokenSource = "config" | "env" | "none";

export interface InstagramAccountBaseConfig {
  enabled?: boolean;
  accessToken?: string;
  appSecret?: string;
  webhookVerifyToken?: string;
  webhookPath?: string;
  webhookPort?: number;
  webhookHost?: string;
  name?: string;
  allowFrom?: Array<string | number>;
  dmPolicy?: "open" | "allowlist" | "pairing" | "disabled";
}

export interface InstagramConfig extends InstagramAccountBaseConfig {
  defaultAccount?: string;
}

export interface ResolvedInstagramAccount {
  accountId: string;
  name?: string;
  enabled: boolean;
  accessToken: string;
  appSecret: string;
  webhookVerifyToken: string;
  tokenSource: InstagramTokenSource;
  config: InstagramConfig;
}

export type InstagramProbeResult = BaseProbeResult<string> & {
  page?: {
    id?: string;
    name?: string;
  };
};

// Meta Messenger Platform webhook payload shapes
export interface MetaWebhookPayload {
  object: string;
  entry: MetaWebhookEntry[];
}

export interface MetaWebhookEntry {
  id: string;
  time: number;
  messaging?: MetaMessagingEvent[];
}

export interface MetaMessagingEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid: string;
    text?: string;
    is_echo?: boolean;
    attachments?: Array<{
      type: string;
      payload: { url?: string; sticker_id?: number };
    }>;
  };
  postback?: {
    title: string;
    payload: string;
  };
  reaction?: {
    reaction: string;
    emoji: string;
    action: "react" | "unreact";
    mid: string;
  };
}
