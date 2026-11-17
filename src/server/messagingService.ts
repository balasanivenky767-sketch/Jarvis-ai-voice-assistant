import { GoogleGenAI } from "@google/genai";

export type JarvisMessagePlatform = "telegram" | "whatsapp";
export type JarvisMessageDirection = "incoming" | "outgoing";

export interface JarvisMessageEvent {
  eventId: string;
  platform: JarvisMessagePlatform;
  direction: JarvisMessageDirection;
  senderId?: string;
  senderName?: string;
  recipientId?: string;
  messageId?: string;
  conversationId?: string;
  text?: string;
  timestamp: string;
  status?: "received" | "sent" | "delivered" | "failed";
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface SendTelegramMessageParams {
  chatId: string | number;
  message: string;
  conversationId?: string;
  eventId?: string;
  replyToMessageId?: number;
}

export interface SendWhatsAppMessageParams {
  recipient: string;
  message: string;
  conversationId?: string;
  eventId?: string;
}

export interface MessagingConfigStatus {
  telegram: {
    isConfigured: boolean;
    hasToken: boolean;
    botUsername?: string | null;
    botName?: string | null;
    allowedUsers: string;
    defaultChatId?: string | null;
    knownChats?: Array<{ id: string; name: string; username?: string; lastSeen: string }>;
    webhookUrl?: string | null;
  };
  whatsapp: {
    isConfigured: boolean;
    hasToken: boolean;
    phoneNumberId?: string | null;
    verifyTokenSet: boolean;
    allowedNumbers: string;
    webhookUrl?: string | null;
  };
}

// In-memory conversation memory mapping conversationId -> chat history
// Reuses standard Gemini message parts structure
interface ChatTurn {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

const conversationMemory = new Map<string, ChatTurn[]>();

// Known Telegram chats tracked when messages or interactions occur
const knownTelegramChats = new Map<string, { id: string; name: string; username?: string; lastSeen: string }>();

// Recent normalized message events buffer for HUD telemetry (max 50)
const recentEvents: JarvisMessageEvent[] = [];

// Event deduplication set (stores platform:messageId with max capacity)
const processedMessageIds = new Set<string>();

// Listeners for live real-time HUD message streaming
type MessageEventListener = (event: JarvisMessageEvent) => void;
const messageListeners = new Set<MessageEventListener>();

export function subscribeToMessageEvents(listener: MessageEventListener): () => void {
  messageListeners.add(listener);
  return () => messageListeners.delete(listener);
}

function broadcastMessageEvent(event: JarvisMessageEvent) {
  recentEvents.unshift(event);
  if (recentEvents.length > 50) recentEvents.pop();

  for (const listener of messageListeners) {
    try {
      listener(event);
    } catch (err) {
      console.warn("Message listener error:", err);
    }
  }
}

export function listRecentMessageEvents(limit: number = 30): JarvisMessageEvent[] {
  return recentEvents.slice(0, limit);
}

export function clearMessageHistory(conversationId?: string): void {
  if (conversationId) {
    conversationMemory.delete(conversationId);
  } else {
    conversationMemory.clear();
    recentEvents.length = 0;
  }
}

/**
 * Deduplication check to prevent duplicate message processing.
 */
function isDuplicateMessage(platform: JarvisMessagePlatform, messageId: string | number | undefined): boolean {
  if (!messageId) return false;
  const key = `${platform}:${messageId}`;
  if (processedMessageIds.has(key)) {
    return true;
  }
  processedMessageIds.add(key);
  // Keep set size bounded
  if (processedMessageIds.size > 2000) {
    const firstKey = processedMessageIds.values().next().value;
    if (firstKey) processedMessageIds.delete(firstKey);
  }
  return false;
}

/**
 * Authorization engine for incoming Telegram senders.
 */
export function isTelegramUserAuthorized(userId: string | number, username?: string): boolean {
  const allowed = (process.env.TELEGRAM_ALLOWED_USERS || "*").trim();
  if (allowed === "*" || allowed === "") return true;

  const allowedList = allowed.split(",").map((s) => s.trim().toLowerCase());
  const idStr = String(userId).toLowerCase();
  const userStr = username ? username.toLowerCase().replace(/^@/, "") : "";

  return (
    allowedList.includes(idStr) ||
    (Boolean(userStr) && (allowedList.includes(userStr) || allowedList.includes(`@${userStr}`)))
  );
}

/**
 * Authorization engine for incoming WhatsApp senders.
 */
export function isWhatsAppSenderAuthorized(phoneNumber: string): boolean {
  const allowed = (process.env.WHATSAPP_ALLOWED_NUMBERS || "*").trim();
  if (allowed === "*" || allowed === "") return true;

  const allowedList = allowed.split(",").map((s) => s.replace(/[^\d]/g, ""));
  const cleanPhone = phoneNumber.replace(/[^\d]/g, "");

  return allowedList.includes(cleanPhone) || allowedList.includes(cleanPhone.slice(-10));
}

/**
 * Format recipient phone number for WhatsApp Meta Graph API (country code + number without '+')
 */
function formatWhatsAppRecipient(recipient: string): string {
  let cleaned = recipient.replace(/[^\d]/g, "");
  if (cleaned.length === 10) {
    // If 10 digits starting with 6-9, assume India country code +91
    if (["6", "7", "8", "9"].includes(cleaned[0])) {
      cleaned = `91${cleaned}`;
    } else {
      cleaned = `1${cleaned}`;
    }
  }
  return cleaned;
}

/**
 * Configuration status inspector (never prints secrets).
 */
export async function getMessagingConfigStatus(): Promise<MessagingConfigStatus> {
  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  const waToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const waVerify = process.env.WHATSAPP_VERIFY_TOKEN;
  const appUrl = (process.env.APP_URL || "").replace(/\/$/, "");

  let botUsername: string | null = null;
  let botName: string | null = null;

  if (tgToken) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${tgToken}/getMe`, { method: "GET" });
      const data = await res.json();
      if (data.ok && data.result) {
        botUsername = data.result.username || null;
        botName = data.result.first_name || null;
      }
    } catch (_) {}
  }

  return {
    telegram: {
      isConfigured: Boolean(tgToken && tgToken.includes(":")),
      hasToken: Boolean(tgToken),
      botUsername,
      botName,
      allowedUsers: process.env.TELEGRAM_ALLOWED_USERS || "*",
      defaultChatId: process.env.TELEGRAM_DEFAULT_CHAT_ID || null,
      knownChats: Array.from(knownTelegramChats.values()),
      webhookUrl: appUrl ? `${appUrl}/api/telegram/webhook` : null,
    },
    whatsapp: {
      isConfigured: Boolean(waToken && waPhoneId),
      hasToken: Boolean(waToken),
      phoneNumberId: waPhoneId || null,
      verifyTokenSet: Boolean(waVerify),
      allowedNumbers: process.env.WHATSAPP_ALLOWED_NUMBERS || "*",
      webhookUrl: appUrl ? `${appUrl}/api/whatsapp/webhook` : null,
    },
  };
}

/**
 * Update server-side credentials securely.
 */
export function updateMessagingCredentials(creds: {
  telegramBotToken?: string;
  telegramAllowedUsers?: string;
  telegramDefaultChatId?: string;
  telegramWebhookSecret?: string;
  whatsAppAccessToken?: string;
  whatsAppPhoneNumberId?: string;
  whatsAppVerifyToken?: string;
  whatsAppAllowedNumbers?: string;
}): { success: boolean } {
  if (creds.telegramBotToken !== undefined) {
    process.env.TELEGRAM_BOT_TOKEN = creds.telegramBotToken.trim();
  }
  if (creds.telegramAllowedUsers !== undefined) {
    process.env.TELEGRAM_ALLOWED_USERS = creds.telegramAllowedUsers.trim();
  }
  if (creds.telegramDefaultChatId !== undefined) {
    process.env.TELEGRAM_DEFAULT_CHAT_ID = creds.telegramDefaultChatId.trim();
  }
  if (creds.telegramWebhookSecret !== undefined) {
    process.env.TELEGRAM_WEBHOOK_SECRET = creds.telegramWebhookSecret.trim();
  }
  if (creds.whatsAppAccessToken !== undefined) {
    process.env.WHATSAPP_ACCESS_TOKEN = creds.whatsAppAccessToken.trim();
  }
  if (creds.whatsAppPhoneNumberId !== undefined) {
    process.env.WHATSAPP_PHONE_NUMBER_ID = creds.whatsAppPhoneNumberId.trim();
  }
  if (creds.whatsAppVerifyToken !== undefined) {
    process.env.WHATSAPP_VERIFY_TOKEN = creds.whatsAppVerifyToken.trim();
  }
  if (creds.whatsAppAllowedNumbers !== undefined) {
    process.env.WHATSAPP_ALLOWED_NUMBERS = creds.whatsAppAllowedNumbers.trim();
  }

  return { success: true };
}

// ==========================================
// 1. TELEGRAM ADAPTER
// ==========================================

/**
 * Fetch updates from Telegram Bot API to automatically discover chat IDs.
 */
export async function syncTelegramUpdates(): Promise<Array<{ id: string; name: string; username?: string }>> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return [];

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=20`);
    const data = await res.json();
    if (data.ok && Array.isArray(data.result)) {
      for (const update of data.result) {
        const msg = update.message || update.channel_post || update.edited_message;
        if (msg && msg.chat && msg.chat.id) {
          const chatIdStr = String(msg.chat.id);
          const name = [msg.chat.first_name, msg.chat.last_name, msg.chat.title].filter(Boolean).join(" ") || msg.chat.username || `Chat ${chatIdStr}`;
          knownTelegramChats.set(chatIdStr, {
            id: chatIdStr,
            name,
            username: msg.chat.username,
            lastSeen: new Date(msg.date ? msg.date * 1000 : Date.now()).toISOString(),
          });
        }
      }
    }
  } catch (_) {}

  return Array.from(knownTelegramChats.values());
}

/**
 * JARVIS -> TELEGRAM: Send an outgoing message via official Telegram Bot API
 */
export async function sendTelegramMessage(
  params: SendTelegramMessageParams
): Promise<{ success: boolean; messageId?: number; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    const error = "Telegram Bot Token not configured (TELEGRAM_BOT_TOKEN missing in environment).";
    console.warn("sendTelegramMessage notice:", error);
    return { success: false, error };
  }

  let {
    chatId,
    message,
    conversationId,
    eventId = `ev_tg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    replyToMessageId,
  } = params;

  // Resolve target chatId with fallback to default configured or recently discovered active chat
  let targetChatId = String(chatId || "").trim();
  if (!targetChatId || targetChatId === "default" || targetChatId === "me" || targetChatId === "user" || targetChatId === "12345678") {
    if (process.env.TELEGRAM_DEFAULT_CHAT_ID) {
      targetChatId = process.env.TELEGRAM_DEFAULT_CHAT_ID.trim();
    } else if (knownTelegramChats.size > 0) {
      targetChatId = Array.from(knownTelegramChats.keys())[0];
    }
  }

  if (!targetChatId || targetChatId === "12345678") {
    const error = "Telegram Chat ID not specified. Please provide a valid numerical chat ID (e.g. 123456789) or start a chat with your bot on Telegram first.";
    return { success: false, error };
  }

  if (!conversationId) {
    conversationId = `telegram:${targetChatId}`;
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const payload: Record<string, any> = {
      chat_id: targetChatId,
      text: message,
    };
    if (replyToMessageId) {
      payload.reply_to_message_id = replyToMessageId;
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!data.ok) {
      let rawDescription = data.description || "Telegram API rejected message";
      let errorMsg = rawDescription;

      if (rawDescription.toLowerCase().includes("chat not found")) {
        errorMsg = `Telegram chat not found (Chat ID: ${targetChatId}). The recipient must initiate a conversation with your bot first by opening the bot in Telegram and clicking /start.`;
      } else if (rawDescription.toLowerCase().includes("bot was blocked by the user")) {
        errorMsg = `Telegram bot was blocked by user (${targetChatId}).`;
      }

      console.log("[Telegram] Message delivery note:", errorMsg);

      broadcastMessageEvent({
        eventId,
        platform: "telegram",
        direction: "outgoing",
        recipientId: String(targetChatId),
        conversationId,
        text: message,
        timestamp: new Date().toISOString(),
        status: "failed",
        error: errorMsg,
      });

      return { success: false, error: errorMsg };
    }

    const sentMessageId = data.result?.message_id;

    broadcastMessageEvent({
      eventId,
      platform: "telegram",
      direction: "outgoing",
      recipientId: String(targetChatId),
      messageId: String(sentMessageId),
      conversationId,
      text: message,
      timestamp: new Date().toISOString(),
      status: "sent",
      metadata: { telegramMessageId: sentMessageId },
    });

    return { success: true, messageId: sentMessageId };
  } catch (err: any) {
    const errorMsg = err?.message || "Network error sending Telegram message";
    console.log("[Telegram] Network delivery note:", errorMsg);

    broadcastMessageEvent({
      eventId,
      platform: "telegram",
      direction: "outgoing",
      recipientId: String(targetChatId),
      conversationId,
      text: message,
      timestamp: new Date().toISOString(),
      status: "failed",
      error: errorMsg,
    });

    return { success: false, error: errorMsg };
  }
}

/**
 * Formulates response through the EXISTING JARVIS BRAIN with resilient model fallback.
 */
async function generateJarvisMessageReply(
  ai: GoogleGenAI,
  history: ChatTurn[],
  instruction: string
): Promise<string> {
  const modelsToTry = ["gemini-3.1-flash", "gemini-3.8-flash", "gemini-3.1-pro-preview"];

  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: history,
        config: {
          systemInstruction: instruction,
        },
      });
      if (response.text) return response.text;
    } catch (err: any) {
      console.warn(`Model ${model} request notice:`, err?.message || err);
    }
  }

  return "Hey babe! Message received loud and clear. My neural processors are operating at peak capacity—what's our next move?";
}

/**
 * TELEGRAM -> JARVIS: Process an incoming Telegram webhook update through EXISTING JARVIS BRAIN
 */
export async function handleTelegramWebhookUpdate(
  update: any,
  ai: GoogleGenAI,
  systemInstruction: string,
  secretHeader?: string
): Promise<{ handled: boolean; reason?: string; responseText?: string }> {
  // Validate secret token if configured
  const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (configuredSecret && secretHeader !== configuredSecret) {
    console.warn("Telegram webhook rejected: invalid X-Telegram-Bot-Api-Secret-Token");
    return { handled: false, reason: "Invalid secret token" };
  }

  const message = update?.message || update?.edited_message;
  if (!message || !message.text) {
    return { handled: false, reason: "No text message in update" };
  }

  const messageId = String(message.message_id);
  const chatId = String(message.chat?.id);
  const senderId = String(message.from?.id || chatId);
  const senderUsername = message.from?.username;
  const senderName = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ") || senderUsername || "Telegram User";
  const text = message.text.trim();

  // 1. Deduplication check
  if (isDuplicateMessage("telegram", messageId)) {
    console.log(`Telegram duplicate message ignored: ${messageId}`);
    return { handled: true, reason: "Duplicate message ignored" };
  }

  // 2. Authorization check
  if (!isTelegramUserAuthorized(senderId, senderUsername)) {
    console.warn(`Telegram message from unauthorized user: ${senderId} (@${senderUsername || "none"})`);
    return { handled: false, reason: "Unauthorized sender" };
  }

  const conversationId = `telegram:${chatId}`;
  const incomingEventId = `ev_tg_in_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  // Automatically remember active Telegram chat
  knownTelegramChats.set(chatId, {
    id: chatId,
    name: senderName,
    username: senderUsername,
    lastSeen: new Date().toISOString(),
  });

  // Record incoming event
  broadcastMessageEvent({
    eventId: incomingEventId,
    platform: "telegram",
    direction: "incoming",
    senderId,
    senderName,
    messageId,
    conversationId,
    text,
    timestamp: new Date(message.date ? message.date * 1000 : Date.now()).toISOString(),
    status: "received",
  });

  // 3. Connect directly to EXISTING JARVIS BRAIN
  try {
    // Retrieve or initialize conversation memory for this chat
    let history = conversationMemory.get(conversationId);
    if (!history) {
      history = [];
      conversationMemory.set(conversationId, history);
    }

    // Add user message turn
    history.push({
      role: "user",
      parts: [{ text: text }],
    });

    // Keep memory history bounded (last 16 turns)
    if (history.length > 16) {
      history.splice(0, history.length - 16);
    }

    const messagingPersonaInstruction = `${systemInstruction}
CHANNEL CONTEXT:
You are communicating with the user via their real Telegram chat.
Sender: "${senderName}" (ID: ${senderId}).
Keep your answers vibrant, witty, and concise. Format clean readable text without audio cues.`;

    const responseText = await generateJarvisMessageReply(ai, history, messagingPersonaInstruction);

    // Add Jarvis response turn to memory
    history.push({
      role: "model",
      parts: [{ text: responseText }],
    });

    // 4. Send response back to Telegram chat
    await sendTelegramMessage({
      chatId,
      message: responseText,
      conversationId,
      replyToMessageId: message.message_id,
    });

    return { handled: true, responseText };
  } catch (err: any) {
    console.log("[Telegram] Brain processing note:", err?.message || err);
    return { handled: false, reason: err?.message || "Brain processing error" };
  }
}

/**
 * Configure Telegram Bot Webhook
 */
export async function setTelegramWebhook(
  publicBaseUrl: string
): Promise<{ success: boolean; result?: any; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { success: false, error: "TELEGRAM_BOT_TOKEN not configured" };

  let url = publicBaseUrl.replace(/\/$/, "");
  if (!url.startsWith("http")) url = `https://${url}`;
  const webhookUrl = `${url}/api/telegram/webhook`;

  try {
    const params: Record<string, any> = {
      url: webhookUrl,
      drop_pending_updates: false,
    };
    if (process.env.TELEGRAM_WEBHOOK_SECRET) {
      params.secret_token = process.env.TELEGRAM_WEBHOOK_SECRET;
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    return { success: data.ok, result: data };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to set webhook" };
  }
}

/**
 * Get Telegram Bot Webhook Info
 */
export async function getTelegramWebhookInfo(): Promise<any> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { error: "TELEGRAM_BOT_TOKEN not configured" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    return await res.json();
  } catch (err: any) {
    return { error: err?.message || "Failed to get webhook info" };
  }
}

// ==========================================
// 2. WHATSAPP ADAPTER (Meta WhatsApp Cloud API)
// ==========================================

/**
 * JARVIS -> WHATSAPP: Send an outgoing message via official Meta WhatsApp Cloud API
 */
export async function sendWhatsAppMessage(
  params: SendWhatsAppMessageParams
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    const error =
      "WhatsApp credentials missing. Configure WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID";
    console.warn("sendWhatsAppMessage notice:", error);
    return { success: false, error };
  }

  const {
    recipient,
    message,
    conversationId = `whatsapp:${recipient}`,
    eventId = `ev_wa_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
  } = params;

  const formattedRecipient = formatWhatsAppRecipient(recipient);

  try {
    const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: formattedRecipient,
      type: "text",
      text: {
        preview_url: false,
        body: message,
      },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (data.error) {
      const errorMsg = data.error.message || "Meta API rejected WhatsApp message";
      console.warn("Meta WhatsApp error:", errorMsg);

      broadcastMessageEvent({
        eventId,
        platform: "whatsapp",
        direction: "outgoing",
        recipientId: formattedRecipient,
        conversationId,
        text: message,
        timestamp: new Date().toISOString(),
        status: "failed",
        error: errorMsg,
      });

      return { success: false, error: errorMsg };
    }

    const sentMessageId = data.messages?.[0]?.id;

    broadcastMessageEvent({
      eventId,
      platform: "whatsapp",
      direction: "outgoing",
      recipientId: formattedRecipient,
      messageId: sentMessageId,
      conversationId,
      text: message,
      timestamp: new Date().toISOString(),
      status: "sent",
      metadata: { whatsappMessageId: sentMessageId },
    });

    return { success: true, messageId: sentMessageId };
  } catch (err: any) {
    const errorMsg = err?.message || "Network error sending WhatsApp message";
    console.warn("sendWhatsAppMessage exception:", errorMsg);

    broadcastMessageEvent({
      eventId,
      platform: "whatsapp",
      direction: "outgoing",
      recipientId: formattedRecipient,
      conversationId,
      text: message,
      timestamp: new Date().toISOString(),
      status: "failed",
      error: errorMsg,
    });

    return { success: false, error: errorMsg };
  }
}

/**
 * Handles Meta Webhook Verification Challenge (GET /api/whatsapp/webhook)
 */
export function verifyWhatsAppWebhook(query: Record<string, any>): {
  isValid: boolean;
  challenge?: string;
} {
  const mode = query["hub.mode"];
  const token = query["hub.verify_token"];
  const challenge = query["hub.challenge"];

  const configuredVerifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && configuredVerifyToken && token === configuredVerifyToken) {
    return { isValid: true, challenge };
  }

  // If verify token not set yet, accept match if token is present
  if (mode === "subscribe" && token && !configuredVerifyToken) {
    return { isValid: true, challenge };
  }

  return { isValid: false };
}

/**
 * WHATSAPP -> JARVIS: Process an incoming WhatsApp webhook update through EXISTING JARVIS BRAIN
 */
export async function handleWhatsAppWebhookPayload(
  body: any,
  ai: GoogleGenAI,
  systemInstruction: string
): Promise<{ handled: boolean; reason?: string; responseText?: string }> {
  // Validate standard Meta WhatsApp Cloud API envelope
  if (body?.object !== "whatsapp_business_account") {
    return { handled: false, reason: "Not a whatsapp_business_account object" };
  }

  const entries = body.entry || [];
  let processedCount = 0;
  let lastResponse = "";

  for (const entry of entries) {
    const changes = entry.changes || [];
    for (const change of changes) {
      if (change.field !== "messages") continue;

      const value = change.value;
      const messages = value?.messages || [];
      const contacts = value?.contacts || [];

      for (const msg of messages) {
        // We handle incoming text messages
        if (msg.type !== "text" || !msg.text?.body) continue;

        const messageId = msg.id;
        const senderPhone = msg.from;
        const text = msg.text.body.trim();

        // Contact info
        const contact = contacts.find((c: any) => c.wa_id === senderPhone);
        const senderName = contact?.profile?.name || `+${senderPhone}`;

        // 1. Deduplication check
        if (isDuplicateMessage("whatsapp", messageId)) {
          console.log(`WhatsApp duplicate message ignored: ${messageId}`);
          continue;
        }

        // 2. Authorization check
        if (!isWhatsAppSenderAuthorized(senderPhone)) {
          console.warn(`WhatsApp message from unauthorized number: ${senderPhone}`);
          continue;
        }

        const conversationId = `whatsapp:${senderPhone}`;
        const incomingEventId = `ev_wa_in_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

        // Record incoming event
        broadcastMessageEvent({
          eventId: incomingEventId,
          platform: "whatsapp",
          direction: "incoming",
          senderId: senderPhone,
          senderName,
          messageId,
          conversationId,
          text,
          timestamp: new Date(msg.timestamp ? parseInt(msg.timestamp, 10) * 1000 : Date.now()).toISOString(),
          status: "received",
        });

        // 3. Connect to EXISTING JARVIS BRAIN
        try {
          let history = conversationMemory.get(conversationId);
          if (!history) {
            history = [];
            conversationMemory.set(conversationId, history);
          }

          history.push({
            role: "user",
            parts: [{ text }],
          });

          if (history.length > 16) {
            history.splice(0, history.length - 16);
          }

          const messagingPersonaInstruction = `${systemInstruction}
CHANNEL CONTEXT:
You are chatting with the user via official WhatsApp messaging.
User: "${senderName}" (Phone: +${senderPhone}).
Keep your reply sharp, charismatic, and conversational. Standard concise text formatting.`;

          const response = await ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: history,
            config: {
              systemInstruction: messagingPersonaInstruction,
            },
          });

          const responseText =
            response.text || "Message received on WhatsApp, babe! What next?";

          history.push({
            role: "model",
            parts: [{ text: responseText }],
          });

          // 4. Send response back to user via WhatsApp
          await sendWhatsAppMessage({
            recipient: senderPhone,
            message: responseText,
            conversationId,
          });

          processedCount++;
          lastResponse = responseText;
        } catch (err: any) {
          console.warn("WhatsApp brain response error:", err?.message || err);
        }
      }
    }
  }

  return {
    handled: processedCount > 0,
    reason: processedCount > 0 ? undefined : "No processable text messages found",
    responseText: lastResponse || undefined,
  };
}
