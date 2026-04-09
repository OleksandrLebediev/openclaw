import type { MetaMessagingEvent } from "./types.js";

export interface InstagramInboundMessage {
  /** Instagram-scoped sender ID (IGSID) */
  senderId: string;
  /** Page-scoped recipient ID */
  recipientId: string;
  /** Unique message ID from Meta */
  mid: string;
  /** Millisecond timestamp */
  timestamp: number;
  /** Text content — empty string for non-text messages */
  text: string;
  /** True if this is an echo of an outbound message from the page */
  isEcho: boolean;
  /** Attachment URLs for media messages */
  attachmentUrls: string[];
}

/**
 * Transform a raw Meta messaging event into an internal message representation.
 * Returns null for events that should not be dispatched (echoes, reactions, etc.).
 */
export function transformMetaEvent(event: MetaMessagingEvent): InstagramInboundMessage | null {
  const { message } = event;

  // Skip reaction events — no text to dispatch
  if (event.reaction && !message) {
    return null;
  }

  // Skip echo messages (outbound messages sent by the page itself)
  if (message?.is_echo) {
    return null;
  }

  if (!message) {
    return null;
  }

  const attachmentUrls: string[] = [];
  for (const attachment of message.attachments ?? []) {
    const url = attachment.payload?.url;
    if (url) {
      attachmentUrls.push(url);
    }
  }

  const text = message.text?.trim() ?? "";

  // Skip messages with no text and no media attachment (e.g. sticker-only with no url)
  if (!text && attachmentUrls.length === 0) {
    return null;
  }

  return {
    senderId: event.sender.id,
    recipientId: event.recipient.id,
    mid: message.mid,
    timestamp: event.timestamp,
    text,
    isEcho: false,
    attachmentUrls,
  };
}
