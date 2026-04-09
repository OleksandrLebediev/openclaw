import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createChannelReplyPipeline } from "openclaw/plugin-sdk/channel-reply-pipeline";
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-runtime";
import { danger, waitForAbortSignal, type RuntimeEnv } from "openclaw/plugin-sdk/runtime-env";
import {
  normalizePluginHttpPath,
  registerPluginHttpRoute,
} from "openclaw/plugin-sdk/webhook-ingress";
import { transformMetaEvent } from "./message-transform.js";
import { getInstagramRuntime } from "./runtime.js";
import { sendInstagramMessage } from "./send.js";
import type { MetaMessagingEvent, MetaWebhookPayload, ResolvedInstagramAccount } from "./types.js";

const INSTAGRAM_MAX_BODY_BYTES = 256 * 1024;
const INSTAGRAM_BODY_TIMEOUT_MS = 15_000;

function verifyMetaSignature(body: Buffer, signature: string, appSecret: string): boolean {
  if (!signature.startsWith("sha256=")) {
    return false;
  }
  const expected = createHmac("sha256", appSecret).update(body).digest("hex");
  const provided = signature.slice("sha256=".length);
  if (expected.length !== provided.length) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"));
  } catch {
    return false;
  }
}

async function readBody(req: IncomingMessage): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let done = false;

    const timeout = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(null);
      }
    }, INSTAGRAM_BODY_TIMEOUT_MS);

    req.on("data", (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > INSTAGRAM_MAX_BODY_BYTES) {
        if (!done) {
          done = true;
          clearTimeout(timeout);
          resolve(null);
        }
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (!done) {
        done = true;
        clearTimeout(timeout);
        resolve(Buffer.concat(chunks));
      }
    });

    req.on("error", () => {
      if (!done) {
        done = true;
        clearTimeout(timeout);
        resolve(null);
      }
    });
  });
}

function sendText(res: ServerResponse, status: number, text: string): void {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(payload);
}

async function processInstagramMessage(params: {
  event: MetaMessagingEvent;
  account: ResolvedInstagramAccount;
  config: OpenClawConfig;
  runtime: RuntimeEnv;
}): Promise<void> {
  const { event, account, config, runtime } = params;
  const msg = transformMetaEvent(event);
  if (!msg) {
    return;
  }

  runtime.log(
    `instagram: inbound sender=${msg.senderId} recipient=${msg.recipientId} mid=${msg.mid}`,
  );

  const core = getInstagramRuntime();

  const route = core.channel.routing.resolveAgentRoute({
    cfg: config,
    channel: "instagram",
    accountId: account.accountId,
    peer: { kind: "direct", id: msg.senderId },
  });

  const rawBody = msg.text || (msg.attachmentUrls.length > 0 ? "<media:attachment>" : "");
  if (!rawBody) {
    return;
  }

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: rawBody,
    BodyForAgent: msg.text || rawBody,
    RawBody: msg.text || rawBody,
    CommandBody: msg.text || rawBody,
    From: `instagram:${msg.senderId}`,
    To: `instagram:${msg.recipientId}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: "direct" as const,
    MessageSid: msg.mid,
    Provider: "instagram",
    Surface: "instagram",
    OriginatingChannel: "instagram",
    OriginatingTo: `instagram:${msg.recipientId}`,
    ...(msg.attachmentUrls[0] ? { MediaUrl: msg.attachmentUrls[0] } : {}),
  });

  const { onModelSelected, ...replyPipeline } = createChannelReplyPipeline({
    cfg: config,
    agentId: route.agentId,
    channel: "instagram",
    accountId: route.accountId,
  });

  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg: config,
    dispatcherOptions: {
      ...replyPipeline,
      deliver: async (payload) => {
        const text = typeof payload.text === "string" ? payload.text.trim() : "";
        if (!text) {
          return;
        }
        await sendInstagramMessage({
          accessToken: account.accessToken,
          recipientId: msg.senderId,
          // msg.recipientId is the Instagram Business Account ID (IGSID)
          igAccountId: msg.recipientId,
          text,
        });
      },
      onError: (err, info) => {
        runtime.error(danger(`instagram ${info.kind} reply failed: ${String(err)}`));
      },
    },
    replyOptions: { onModelSelected },
  });
}

export interface MonitorInstagramOptions {
  account: ResolvedInstagramAccount;
  config: OpenClawConfig;
  runtime: RuntimeEnv;
  abortSignal?: AbortSignal;
  webhookPath?: string;
}

export function monitorInstagramProvider(options: MonitorInstagramOptions): () => void {
  const { account, config, runtime, webhookPath } = options;

  const normalizedPath =
    normalizePluginHttpPath(webhookPath, "/instagram/webhook") ?? "/instagram/webhook";

  const unregister = registerPluginHttpRoute({
    path: normalizedPath,
    auth: "plugin",
    replaceExisting: true,
    pluginId: "instagram",
    accountId: account.accountId,
    log: (msg) => runtime.log(msg),
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      const reqUrl = req.url ?? "/";

      // GET: Meta hub.challenge webhook verification
      if (req.method === "GET") {
        const url = new URL(reqUrl, `http://localhost`);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");

        if (mode === "subscribe" && token === account.webhookVerifyToken && challenge) {
          sendText(res, 200, challenge);
          runtime.log(`instagram: webhook verified for account "${account.accountId}"`);
          return true;
        }
        sendJson(res, 403, { error: "Verification failed" });
        runtime.log(
          `instagram: verification failed for account "${account.accountId}" (token mismatch)`,
        );
        return true;
      }

      // POST: incoming message events
      if (req.method === "POST") {
        const body = await readBody(req);
        if (!body) {
          sendJson(res, 400, { error: "Missing or oversized request body" });
          return true;
        }

        const signature = req.headers["x-hub-signature-256"];
        if (!signature || typeof signature !== "string") {
          sendJson(res, 401, { error: "Missing X-Hub-Signature-256 header" });
          return true;
        }

        if (account.appSecret && !verifyMetaSignature(body, signature, account.appSecret)) {
          runtime.log(`instagram: invalid signature for account "${account.accountId}"`);
          sendJson(res, 401, { error: "Invalid signature" });
          return true;
        }

        let payload: MetaWebhookPayload;
        try {
          payload = JSON.parse(body.toString("utf-8")) as MetaWebhookPayload;
        } catch {
          sendJson(res, 400, { error: "Invalid JSON payload" });
          return true;
        }

        if (payload.object !== "instagram" && payload.object !== "page") {
          sendJson(res, 400, { error: "Unexpected webhook object type" });
          return true;
        }

        // Acknowledge immediately — Meta requires a 200 within a few seconds
        sendJson(res, 200, { status: "ok" });

        // Process events asynchronously after acknowledgement
        for (const entry of payload.entry ?? []) {
          for (const event of entry.messaging ?? []) {
            processInstagramMessage({ event, account, config, runtime }).catch((err) => {
              runtime.error(danger(`instagram: error processing message: ${String(err)}`));
            });
          }
        }
        return true;
      }

      sendJson(res, 405, { error: "Method not allowed" });
      return true;
    },
  });

  runtime.log(`[${account.accountId}] instagram: webhook registered at ${normalizedPath}`);

  return unregister;
}

export async function startInstagramMonitor(options: MonitorInstagramOptions): Promise<() => void> {
  const unregister = monitorInstagramProvider(options);

  if (options.abortSignal) {
    options.abortSignal.addEventListener("abort", unregister, { once: true });
    await waitForAbortSignal(options.abortSignal);
    unregister();
  }

  return unregister;
}
