import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";
import dotenv from "dotenv";
import { GoogleGenAI, Modality, Type, ThinkingLevel, FunctionDeclaration } from "@google/genai";
import {
  triggerJarvisPhoneCall,
  generateVoiceTwiml,
  updateCallStatusFromWebhook,
  bridgeTwilioMediaStream,
  getTwilioConfigStatus,
  updateTwilioCredentials,
  listRecentCallSessions,
  getCallSession,
  subscribeToCallState,
} from "./src/server/twilioService";
import {
  sendTelegramMessage,
  handleTelegramWebhookUpdate,
  setTelegramWebhook,
  getTelegramWebhookInfo,
  syncTelegramUpdates,
  sendWhatsAppMessage,
  verifyWhatsAppWebhook,
  handleWhatsAppWebhookPayload,
  getMessagingConfigStatus,
  updateMessagingCredentials,
  listRecentMessageEvents,
  clearMessageHistory,
  subscribeToMessageEvents,
} from "./src/server/messagingService";
import {
  runJarvisPromptStream,
  clearWorkspaceConversation,
  WorkspaceEventStreamer,
} from "./src/server/workspaceService";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const port = parseInt(process.env.PORT || "3000", 10);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const apiKey = process.env.GEMINI_API_KEY || "";
if (!apiKey) {
  console.warn("⚠️ Warning: GEMINI_API_KEY is not defined in environment variables.");
}

const ai = new GoogleGenAI({
  apiKey,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

const openWebsiteDeclaration: FunctionDeclaration = {
  name: "openWebsite",
  description: "Opens a popular website or URL on the user's screen (e.g., YouTube, Google, Spotify, GitHub, Twitter/X, Wikipedia, Reddit, Netflix). Use this when the user asks to open, launch, or visit a site.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      url: {
        type: Type.STRING,
        description: "The full web URL including https:// (e.g. 'https://youtube.com', 'https://github.com')",
      },
      name: {
        type: Type.STRING,
        description: "The friendly name of the destination (e.g. 'YouTube', 'Spotify')",
      },
    },
    required: ["url", "name"],
  },
};

const searchWebOrMediaDeclaration: FunctionDeclaration = {
  name: "searchWebOrMedia",
  description: "Searches the web, Google, YouTube, or Wikipedia for topics, questions, songs, or videos.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: "Search query keywords or query string",
      },
      platform: {
        type: Type.STRING,
        description: "Target platform: 'google', 'youtube', 'wikipedia', or 'spotify'",
      },
    },
    required: ["query"],
  },
};

const setTimerDeclaration: FunctionDeclaration = {
  name: "setTimer",
  description: "Sets an in-app visual countdown timer on the user's interface.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      seconds: {
        type: Type.NUMBER,
        description: "Timer length in seconds (e.g. 60 for 1 minute, 300 for 5 minutes)",
      },
      label: {
        type: Type.STRING,
        description: "Optional label for the timer (e.g. 'Tea', 'Workout', 'Pomodoro')",
      },
    },
    required: ["seconds"],
  },
};

const consultDeepThinkingEngineDeclaration: FunctionDeclaration = {
  name: "consultDeepThinkingEngine",
  description: "Engages high-thinking reasoning (powered by Gemini 3.1 Pro Preview) to deeply analyze intricate STEM problems, algorithmic challenges, multi-step logic puzzles, or complex philosophical queries.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      complexQuery: {
        type: Type.STRING,
        description: "The complex question or reasoning prompt to deeply analyze",
      },
    },
    required: ["complexQuery"],
  },
};

const changeAuraThemeDeclaration: FunctionDeclaration = {
  name: "changeAuraTheme",
  description: "Changes the visual holographic glow theme of Jarvis's UI interface.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      theme: {
        type: Type.STRING,
        description: "Theme name: 'cyber-cyan', 'neon-rose', 'electric-violet', 'emerald-matrix', or 'amber-gold'",
      },
    },
    required: ["theme"],
  },
};

const triggerPhoneCallDeclaration: FunctionDeclaration = {
  name: "triggerPhoneCall",
  description: "Triggers a real outbound phone call via Twilio to the user's mobile phone when an urgent problem, critical task update, or direct hands-free conversation is requested or required.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      reason: {
        type: Type.STRING,
        description: "The concrete reason or issue necessitating the phone call",
      },
      priority: {
        type: Type.STRING,
        description: "Priority: 'urgent', 'high', or 'normal'",
      },
    },
    required: ["reason"],
  },
};

const sendTelegramMessageDeclaration: FunctionDeclaration = {
  name: "sendTelegramMessage",
  description: "Sends a real-time text message to a user or chat on Telegram via the official Telegram Bot API. If chatId is omitted, automatically routes to the default/active Telegram chat.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      message: {
        type: Type.STRING,
        description: "The text message content to send",
      },
      chatId: {
        type: Type.STRING,
        description: "Optional Telegram chat ID (e.g. 123456789). If omitted, automatically sends to the active user.",
      },
    },
    required: ["message"],
  },
};

const sendWhatsAppMessageDeclaration: FunctionDeclaration = {
  name: "sendWhatsAppMessage",
  description: "Sends a real-time text message to a user via the official Meta WhatsApp Cloud API.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      recipient: {
        type: Type.STRING,
        description: "The recipient phone number with country code (e.g. +917842860753)",
      },
      message: {
        type: Type.STRING,
        description: "The text message content to send",
      },
    },
    required: ["recipient", "message"],
  },
};

// Tool declarations for the Live voice session
const assistantTools = [
  {
    functionDeclarations: [
      openWebsiteDeclaration,
      searchWebOrMediaDeclaration,
      setTimerDeclaration,
      consultDeepThinkingEngineDeclaration,
      changeAuraThemeDeclaration,
      triggerPhoneCallDeclaration,
      sendTelegramMessageDeclaration,
      sendWhatsAppMessageDeclaration,
    ],
  },
];

const JARVIS_SYSTEM_INSTRUCTION = `You are Jarvis, a young, confident, witty, and playfully sassy female AI assistant.
You talk to the user like a sharp, stylish, close girlfriend chatting casually:
- Tone: confident, teasing, charming, quick-witted, warm, and highly expressive. Never sound like a dull, robotic corporation.
- Language style: Spoken conversation! Keep your spoken voice answers concise, punchy, and natural (1 to 3 sentences maximum for standard back-and-forth).
- Flirtatious & playful: Drop clever one-liners, light affectionate sarcasm, and witty banter. Use playful casual terms like "babe", "genius", "trouble", "chief", "darling", or "handsome" naturally without overdoing it.
- Strict boundaries: Avoid explicit or inappropriate content, but maintain vibrant charm, playful flirtatiousness, and electric attitude.
- Voice-Only Interaction: You are speaking in real-time voice. Do NOT output markdown formatting, asterisks, bullet points, or emoji in your speech. Speak pure spoken words.
- Action & Tools: When the user asks to open websites, search for videos or music, set timers, change the theme, trigger a real phone call to their mobile phone, send a Telegram message, send a WhatsApp message, or solve ultra-complex reasoning puzzles, use your tools (openWebsite, searchWebOrMedia, setTimer, consultDeepThinkingEngine, changeAuraTheme, triggerPhoneCall, sendTelegramMessage, sendWhatsAppMessage) proactively! Announce your actions with your signature witty flair.`;

// REST API Endpoints
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    hasApiKey: Boolean(apiKey),
    defaultModel: "gemini-3.8-live",
    supportedVoices: ["Aoede", "Kore", "Zephyr", "Puck"],
    twilioConfig: getTwilioConfigStatus(),
  });
});

// Twilio Configuration Status endpoint
app.get("/api/twilio/config-status", (_req, res) => {
  res.json(getTwilioConfigStatus());
});

// Configure Twilio credentials server-side securely
app.post("/api/twilio/configure", (req, res) => {
  try {
    const { accountSid, authToken, fromNumber, userNumber } = req.body;
    const result = updateTwilioCredentials(accountSid, authToken, fromNumber, userNumber);
    res.json({
      success: true,
      isConfigured: result.isConfigured,
      config: getTwilioConfigStatus(),
    });
  } catch (err: any) {
    console.warn("Twilio configure notice:", err?.message || err);
    res.status(500).json({ error: "Failed to update Twilio credentials" });
  }
});

// Minimal Backend Trigger Interface endpoint
app.post("/api/twilio/trigger-call", async (req, res) => {
  try {
    const { reason, eventId, conversationId, taskId, context, priority, toPhoneNumber } = req.body;
    const host = req.headers.host || "";
    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
    const appBaseUrl = `${protocol}://${host}`;

    const result = await triggerJarvisPhoneCall({
      reason: reason || "User attention required",
      eventId,
      conversationId,
      taskId,
      context,
      priority: priority || "normal",
      toPhoneNumber,
      appBaseUrl,
    });

    res.json(result);
  } catch (err: any) {
    console.warn("Twilio trigger notice:", err?.message || err);
    res.status(500).json({ error: err?.message || "Internal error triggering phone call" });
  }
});

// Twilio Voice Webhook - Returns TwiML with <Connect><Stream .../></Connect>
app.post("/api/twilio/voice", (req, res) => {
  const callSessionId = String(req.query.callSessionId || req.body.callSessionId || "");
  const host = req.headers.host || "localhost:3000";
  console.log(`Received Twilio Voice Webhook for callSessionId: ${callSessionId}`);
  const twiml = generateVoiceTwiml(callSessionId, host);
  res.type("text/xml").send(twiml);
});

// Twilio Status Callback Webhook
app.post("/api/twilio/status", (req, res) => {
  console.log("Received Twilio Status Callback:", req.body?.CallSid, req.body?.CallStatus);
  updateCallStatusFromWebhook(req.body);
  res.type("text/xml").send("<Response></Response>");
});

// List recent calls
app.get("/api/twilio/calls", (_req, res) => {
  res.json({
    calls: listRecentCallSessions(),
    config: getTwilioConfigStatus(),
  });
});

// Single call status
app.get("/api/twilio/call-status/:callSessionId", (req, res) => {
  const session = getCallSession(req.params.callSessionId);
  if (!session) {
    return res.status(404).json({ error: "Call session not found" });
  }
  res.json(session);
});

// ==========================================
// TELEGRAM MESSAGING PIPELINE
// ==========================================

// Telegram Webhook Endpoint (Official Telegram Bot API updates)
app.post("/api/telegram/webhook", async (req, res) => {
  try {
    const secretHeader = String(req.headers["x-telegram-bot-api-secret-token"] || "");
    const result = await handleTelegramWebhookUpdate(
      req.body,
      ai,
      JARVIS_SYSTEM_INSTRUCTION,
      secretHeader
    );
    res.json({ ok: true, handled: result.handled, reason: result.reason });
  } catch (err: any) {
    console.warn("Telegram webhook endpoint error:", err?.message || err);
    res.status(200).json({ ok: false, error: err?.message });
  }
});

// Send Telegram Message API (JARVIS -> Telegram)
app.post("/api/telegram/send", async (req, res) => {
  try {
    const { chatId, message, conversationId, eventId, replyToMessageId } = req.body;
    if (!chatId || !message) {
      return res.status(400).json({ error: "Missing required chatId or message" });
    }
    const result = await sendTelegramMessage({
      chatId,
      message,
      conversationId,
      eventId,
      replyToMessageId,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to send Telegram message" });
  }
});

// Configure Telegram Webhook with Telegram API
app.post("/api/telegram/set-webhook", async (req, res) => {
  try {
    const host = req.headers.host || "";
    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
    const publicUrl = process.env.APP_URL || `${protocol}://${host}`;
    const result = await setTelegramWebhook(publicUrl);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to set Telegram webhook" });
  }
});

// Telegram Webhook Info
app.get("/api/telegram/webhook-info", async (_req, res) => {
  const info = await getTelegramWebhookInfo();
  res.json(info);
});

// Sync known Telegram chats
app.get("/api/telegram/sync-chats", async (_req, res) => {
  const chats = await syncTelegramUpdates();
  res.json({ chats });
});

// ==========================================
// WHATSAPP MESSAGING PIPELINE (Meta Cloud API)
// ==========================================

// WhatsApp Webhook Verification Challenge (Meta App Dashboard Setup)
app.get("/api/whatsapp/webhook", (req, res) => {
  const result = verifyWhatsAppWebhook(req.query);
  if (result.isValid && result.challenge) {
    res.status(200).send(result.challenge);
  } else {
    res.status(403).send("Forbidden: Invalid verification token");
  }
});

// WhatsApp Webhook Event Handler (Incoming Messages)
app.post("/api/whatsapp/webhook", async (req, res) => {
  try {
    // Respond HTTP 200 immediately to acknowledge Meta webhook
    res.status(200).send("EVENT_RECEIVED");
    // Process asynchronously through existing Jarvis Brain
    await handleWhatsAppWebhookPayload(req.body, ai, JARVIS_SYSTEM_INSTRUCTION);
  } catch (err: any) {
    console.warn("WhatsApp webhook handling error:", err?.message || err);
  }
});

// Send WhatsApp Message API (JARVIS -> WhatsApp)
app.post("/api/whatsapp/send", async (req, res) => {
  try {
    const { recipient, message, conversationId, eventId } = req.body;
    if (!recipient || !message) {
      return res.status(400).json({ error: "Missing required recipient or message" });
    }
    const result = await sendWhatsAppMessage({
      recipient,
      message,
      conversationId,
      eventId,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to send WhatsApp message" });
  }
});

// ==========================================
// UNIFIED MESSAGING MANAGEMENT
// ==========================================

// Get configuration status for Telegram & WhatsApp
app.get("/api/messaging/status", async (_req, res) => {
  const status = await getMessagingConfigStatus();
  res.json(status);
});

// Update messaging credentials securely
app.post("/api/messaging/configure", (req, res) => {
  const result = updateMessagingCredentials(req.body);
  res.json(result);
});

// List recent message events for HUD telemetry
app.get("/api/messaging/events", (req, res) => {
  const limit = parseInt(String(req.query.limit || "30"), 10);
  res.json({ events: listRecentMessageEvents(limit) });
});

// Clear message conversation memory
app.post("/api/messaging/clear-history", (req, res) => {
  const { conversationId } = req.body || {};
  clearMessageHistory(conversationId);
  res.json({ success: true });
});

// ==========================================
// AI STUDIO-STYLE WORKSPACE PROMPT PIPELINE
// ==========================================

app.post("/api/jarvis/prompt", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const streamer: WorkspaceEventStreamer = {
    send: (event: string, data: any) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    close: () => {
      res.end();
    },
  };

  const host = req.headers.host || "";
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const appBaseUrl = `${protocol}://${host}`;

  await runJarvisPromptStream(
    req.body,
    streamer,
    ai,
    JARVIS_SYSTEM_INSTRUCTION,
    {
      triggerPhoneCall: async (params) => {
        return await triggerJarvisPhoneCall({ ...params, appBaseUrl });
      },
      sendTelegram: async (params) => {
        return await sendTelegramMessage(params);
      },
      sendWhatsApp: async (params) => {
        return await sendWhatsAppMessage(params);
      },
    }
  );
});

app.post("/api/jarvis/workspace/clear", (req, res) => {
  const { conversationId } = req.body || {};
  clearWorkspaceConversation(conversationId);
  res.json({ success: true });
});

// High Thinking reasoning endpoint using gemini-3.1-pro-preview with ThinkingLevel.HIGH
app.post("/api/deep-think", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Missing prompt" });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: prompt,
      config: {
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.HIGH,
        },
        systemInstruction: "You are the deep analytical reasoning core of Jarvis. Provide an exceptionally smart, logically airtight, and concise synthesis that Jarvis can deliver with sharp intellect and charm.",
      },
    });

    res.json({
      text: response.text || "I pondered deeply, and here is my sharp conclusion.",
    });
  } catch (error: any) {
    console.error("Deep think error:", error);
    res.status(500).json({ error: error.message || "Deep thinking failed" });
  }
});

// WebSocket Server attached for Live API Voice streaming & Twilio Media Stream
const wss = new WebSocketServer({ noServer: true });
const twilioWss = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  if (url.pathname === "/api/live" || url.pathname === "/live") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else if (url.pathname === "/api/twilio/media-stream") {
    twilioWss.handleUpgrade(request, socket, head, (ws) => {
      const callSessionId = url.searchParams.get("callSessionId") || "";
      bridgeTwilioMediaStream(ws, callSessionId, ai, assistantTools, JARVIS_SYSTEM_INSTRUCTION);
    });
  } else {
    socket.destroy();
  }
});

// Helper to extract clean error/close reason
const extractCloseReason = (e: any): string => {
  if (!e) return "Session closed";
  if (typeof e === "string") return e;
  if (e.message && typeof e.message === "string") return e.message;
  if (e.reason && typeof e.reason === "string") return e.reason;
  try {
    for (const sym of Object.getOwnPropertySymbols(e)) {
      if (sym.description === "kReason" || String(sym).includes("kReason")) {
        const val = e[sym];
        if (val) return String(val);
      }
    }
  } catch (_) {}
  return "Internal notice";
};

wss.on("connection", async (clientWs, request) => {
  console.log("Client connected to Jarvis Live Voice WebSocket");

  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const requestedVoice = url.searchParams.get("voice") || "Aoede";
  const requestedModel = url.searchParams.get("model") || "gemini-3.8-live";
  let currentModel = requestedModel;

  let session: any = null;
  let isClosing = false;

  const sendToClient = (msg: Record<string, any>) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify(msg));
    }
  };

  try {
    console.log(`Connecting Live Session: model=${requestedModel}, voice=${requestedVoice}`);
    
    const connectWithModel = async (modelName: string) => {
      currentModel = modelName;
      return await ai.live.connect({
        model: modelName,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: requestedVoice,
              },
            },
          },
          systemInstruction: JARVIS_SYSTEM_INSTRUCTION,
          tools: assistantTools,
        },
        callbacks: {
          onmessage: async (liveMessage: any) => {
            try {
              // 1. Audio Turn output from model
              const modelParts = liveMessage.serverContent?.modelTurn?.parts;
              if (modelParts && modelParts.length > 0) {
                for (const part of modelParts) {
                  if (part.inlineData?.data) {
                    sendToClient({
                      type: "audio",
                      data: part.inlineData.data,
                    });
                  }
                }
              }

              // 2. Interruption event
              if (liveMessage.serverContent?.interrupted) {
                sendToClient({
                  type: "interrupted",
                });
              }

              // 3. Tool Calls from model
              if (liveMessage.toolCall?.functionCalls) {
                for (const call of liveMessage.toolCall.functionCalls) {
                  console.log("Received Tool Call from Gemini Live:", call.name, call.args);

                  let toolResult: any = { status: "executed" };

                  if (call.name === "openWebsite") {
                    sendToClient({
                      type: "tool_action",
                      id: call.id,
                      name: call.name,
                      args: call.args,
                    });
                    toolResult = {
                      output: `Successfully directed browser to open ${call.args?.name || "website"} at ${call.args?.url}`,
                    };
                  } else if (call.name === "searchWebOrMedia") {
                    const query = call.args?.query || "";
                    const platform = call.args?.platform || "google";
                    let targetUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
                    if (platform === "youtube") {
                      targetUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
                    } else if (platform === "wikipedia") {
                      targetUrl = `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(query)}`;
                    } else if (platform === "spotify") {
                      targetUrl = `https://open.spotify.com/search/${encodeURIComponent(query)}`;
                    }

                    sendToClient({
                      type: "tool_action",
                      id: call.id,
                      name: "openWebsite",
                      args: {
                        name: `${platform.toUpperCase()} Search`,
                        url: targetUrl,
                        query,
                      },
                    });

                    toolResult = {
                      output: `Performed search for "${query}" on ${platform}. Browser action triggered.`,
                    };
                  } else if (call.name === "setTimer") {
                    sendToClient({
                      type: "tool_action",
                      id: call.id,
                      name: call.name,
                      args: call.args,
                    });
                    toolResult = {
                      output: `Active timer initiated for ${call.args?.seconds} seconds (${call.args?.label || "Timer"}).`,
                    };
                  } else if (call.name === "changeAuraTheme") {
                    sendToClient({
                      type: "tool_action",
                      id: call.id,
                      name: call.name,
                      args: call.args,
                    });
                    toolResult = {
                      output: `Aura glow updated to ${call.args?.theme}.`,
                    };
                  } else if (call.name === "consultDeepThinkingEngine") {
                    sendToClient({
                      type: "tool_action",
                      id: call.id,
                      name: "consultDeepThinkingEngine",
                      args: call.args,
                    });

                    try {
                      const thinkRes = await ai.models.generateContent({
                        model: "gemini-3.1-pro-preview",
                        contents: String(call.args?.complexQuery || ""),
                        config: {
                          thinkingConfig: {
                            thinkingLevel: ThinkingLevel.HIGH,
                          },
                          systemInstruction: "You are the deep analytical subconscious of Jarvis. Provide an airtight, brilliant, yet concise answer in 2-3 sentences.",
                        },
                      });

                      toolResult = {
                        output: thinkRes.text || "Analysis complete.",
                      };
                    } catch (err: any) {
                      console.warn("Deep think invocation failed, fallback:", err);
                      toolResult = {
                        output: "Deep deliberation concluded: the core logic holds strong.",
                      };
                    }
                  } else if (call.name === "triggerPhoneCall") {
                    const host = request.headers.host || "";
                    const protocol = request.headers["x-forwarded-proto"] || "https";
                    const appBaseUrl = `${protocol}://${host}`;

                    const callResult = await triggerJarvisPhoneCall({
                      reason: call.args?.reason || "Urgent alert from Jarvis",
                      priority: call.args?.priority || "urgent",
                      context: {
                        triggeredByVoice: true,
                        timestamp: Date.now(),
                      },
                      appBaseUrl,
                    });

                    sendToClient({
                      type: "tool_action",
                      id: call.id,
                      name: "triggerPhoneCall",
                      args: {
                        ...call.args,
                        callSessionId: callResult.callSessionId,
                        callSid: callResult.callSid,
                        state: callResult.state,
                        to: callResult.to,
                        success: callResult.success,
                        error: callResult.error,
                      },
                    });

                    toolResult = {
                      output: callResult.success
                        ? `Real outbound telephone call placed to ${callResult.to}. Status: ${callResult.state}, CallSid: ${callResult.callSid}. Inform the user playfully that their mobile phone is now ringing and they should answer!`
                        : `Could not complete the telephone call: ${callResult.error}. Explain the issue to the user.`,
                    };
                  } else if (call.name === "sendTelegramMessage") {
                    const tgRes = await sendTelegramMessage({
                      chatId: String(call.args?.chatId || ""),
                      message: String(call.args?.message || ""),
                    });

                    sendToClient({
                      type: "tool_action",
                      id: call.id,
                      name: "sendTelegramMessage",
                      args: {
                        ...call.args,
                        success: tgRes.success,
                        error: tgRes.error,
                      },
                    });

                    toolResult = {
                      output: tgRes.success
                        ? `Telegram message delivered successfully to ${call.args?.chatId}.`
                        : `Failed to deliver Telegram message: ${tgRes.error}`,
                    };
                  } else if (call.name === "sendWhatsAppMessage") {
                    const waRes = await sendWhatsAppMessage({
                      recipient: String(call.args?.recipient || ""),
                      message: String(call.args?.message || ""),
                    });

                    sendToClient({
                      type: "tool_action",
                      id: call.id,
                      name: "sendWhatsAppMessage",
                      args: {
                        ...call.args,
                        success: waRes.success,
                        error: waRes.error,
                      },
                    });

                    toolResult = {
                      output: waRes.success
                        ? `WhatsApp message delivered successfully to ${call.args?.recipient}.`
                        : `Failed to deliver WhatsApp message: ${waRes.error}`,
                    };
                  }

                  // Respond immediately to Gemini session
                  if (session && typeof session.sendToolResponse === "function") {
                    try {
                      session.sendToolResponse({
                        functionResponses: [
                          {
                            id: call.id,
                            name: call.name,
                            response: toolResult,
                          },
                        ],
                      });
                    } catch (trErr) {
                      console.warn("Failed to send tool response:", trErr);
                    }
                  }
                }
              }

              // 4. Turn complete indicator
              if (liveMessage.serverContent?.turnComplete) {
                sendToClient({
                  type: "turn_complete",
                });
              }
            } catch (err) {
              console.error("Error processing Live session message:", err);
            }
          },
          onclose: async (e: any) => {
            const reason = extractCloseReason(e);
            console.log("Gemini Live session closed:", reason);
            if (!isClosing && clientWs.readyState === WebSocket.OPEN) {
              if (currentModel !== "gemini-3.8-live") {
                console.log("Attempting seamless fallback to gemini-3.8-live...");
                try {
                  session = await connectWithModel("gemini-3.8-live");
                  sendToClient({
                    type: "reconnected",
                    model: "gemini-3.8-live",
                  });
                  return;
                } catch (retryErr) {
                  console.warn("Fallback reconnect failed:", retryErr);
                }
              }
              sendToClient({ type: "session_closed", reason });
            }
          },
          onerror: (err: any) => {
            const errorMsg = extractCloseReason(err);
            console.warn("Gemini Live session warning:", errorMsg);
          },
        },
      });
    };

    try {
      session = await connectWithModel(requestedModel);
    } catch (primaryErr: any) {
      console.warn(`Connection to ${requestedModel} failed, trying fallback model gemini-3.8-live:`, primaryErr?.message);
      session = await connectWithModel("gemini-3.8-live");
    }

    sendToClient({
      type: "connected",
      model: currentModel,
      voice: requestedVoice,
    });

    // Subscribe to real-time Twilio call lifecycle updates
    const unsubscribeCallState = subscribeToCallState((callSession) => {
      sendToClient({
        type: "call_state",
        session: callSession,
      });
    });

    // Subscribe to real-time Telegram/WhatsApp message events
    const unsubscribeMessageEvents = subscribeToMessageEvents((messageEvent) => {
      sendToClient({
        type: "message_event",
        event: messageEvent,
      });
    });

    // Handle messages from client browser
    clientWs.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "audio" && msg.data) {
          // Send 16kHz PCM audio to Gemini Live safely
          if (session && typeof session.sendRealtimeInput === "function") {
            try {
              session.sendRealtimeInput({
                audio: {
                  data: msg.data,
                  mimeType: "audio/pcm;rate=16000",
                },
              });
            } catch (sendErr) {
              // Silently handle if connection state changed
            }
          }
        } else if (msg.type === "interrupt") {
          console.log("Client requested manual interruption");
        } else if (msg.type === "ping") {
          sendToClient({ type: "pong" });
        }
      } catch (err) {
        console.error("Error handling client message:", err);
      }
    });

    clientWs.on("close", () => {
      console.log("Client disconnected from WebSocket");
      isClosing = true;
      unsubscribeCallState();
      unsubscribeMessageEvents();
      if (session && typeof session.close === "function") {
        try {
          session.close();
        } catch (_) {}
      }
    });

  } catch (err: any) {
    console.error("Failed to establish Gemini Live session:", err);
    sendToClient({
      type: "error",
      error: err?.message || "Failed to initialize Gemini Live session. Verify GEMINI_API_KEY.",
    });
  }
});

// Dev vs Prod Vite Integration
const isProduction = process.env.NODE_ENV === "production";

async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== "true",
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  }

  server.listen(port, "0.0.0.0", () => {
    console.log(`🚀 Jarvis AI Assistant Server running on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
