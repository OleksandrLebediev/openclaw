const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export interface SendInstagramMessageOptions {
  accessToken: string;
  recipientId: string;
  text: string;
  /** Instagram Business Account ID (IGSID). Defaults to "me" if not provided. */
  igAccountId?: string;
}

export interface SendInstagramMessageResult {
  messageId: string;
  recipientId: string;
}

interface GraphApiResponse {
  message_id?: string;
  recipient_id?: string;
  error?: {
    message: string;
    type: string;
    code: number;
  };
}

export async function sendInstagramMessage(
  options: SendInstagramMessageOptions,
): Promise<SendInstagramMessageResult> {
  const { accessToken, recipientId, text, igAccountId } = options;

  const body = {
    recipient: { id: recipientId },
    message: { text },
    messaging_type: "RESPONSE",
  };

  // Instagram Messaging API requires /{ig-user-id}/messages, not /me/messages
  const senderId = igAccountId ?? "me";
  const response = await fetch(
    `${GRAPH_API_BASE}/${senderId}/messages?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  const data = (await response.json()) as GraphApiResponse;

  if (!response.ok || data.error) {
    const errMsg = data.error?.message ?? `HTTP ${response.status}`;
    throw new Error(`Instagram send failed: ${errMsg}`);
  }

  return {
    messageId: data.message_id ?? "",
    recipientId: data.recipient_id ?? recipientId,
  };
}

export interface InstagramPageInfo {
  id: string;
  name: string;
}

export async function getInstagramPageInfo(accessToken: string): Promise<InstagramPageInfo | null> {
  try {
    const response = await fetch(
      `${GRAPH_API_BASE}/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`,
    );
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as { id?: string; name?: string };
    if (!data.id) {
      return null;
    }
    return { id: data.id, name: data.name ?? data.id };
  } catch {
    return null;
  }
}
