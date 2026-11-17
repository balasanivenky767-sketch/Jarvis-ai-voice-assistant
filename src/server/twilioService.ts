import twilio from "twilio";
import { WebSocket } from "ws";
import { GoogleGenAI, Modality } from "@google/genai";
import {
  decodeUlawToLinear,
  encodeLinearToUlaw,
  resample8kTo16k,
  resample24kTo8k,
} from "./g711";

export type CallLifecycleState =
  | "REQUESTED"
  | "INITIATING"
  | "RINGING"
  | "ANSWERED"
  | "CONNECTED"
  | "LIVE"
  | "COMPLETED"
  | "FAILED"
  | "BUSY"
  | "NO_ANSWER"
  | "REJECTED";

export interface TriggerPhoneCallParams {
  reason: string;
  eventId?: string;
  conversationId?: string;
  taskId?: string;
  context?: Record<string, any>;
  priority?: "urgent" | "high" | "normal" | "low";
  toPhoneNumber?: string;
  appBaseUrl?: string;
}

export interface CallSession {
  callSessionId: string;
  callSid?: string;
  eventId: string;
  conversationId?: string;
  taskId?: string;
  reason: string;
  priority: string;
  context: Record<string, any>;
  state: CallLifecycleState;
  to: string;
  from: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
  answeredAt?: number;
  completedAt?: number;
  duration?: number;
}

// In-memory call sessions registry (no duplicate permanent database)
const callSessions = new Map<string, CallSession>();
const eventCooldowns = new Map<string, number>();

// Listeners for live state broadcasts
type CallStateListener = (session: CallSession) => void;
const stateListeners = new Set<CallStateListener>();

export function subscribeToCallState(listener: CallStateListener): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

function broadcastCallState(session: CallSession) {
  for (const listener of stateListeners) {
    try {
      listener(session);
    } catch (err) {
      console.warn("Call listener error:", err);
    }
  }
}

export function getCallSession(callSessionId: string): CallSession | undefined {
  return callSessions.get(callSessionId);
}

export function getCallSessionBySid(callSid: string): CallSession | undefined {
  for (const session of callSessions.values()) {
    if (session.callSid === callSid) return session;
  }
  return undefined;
}

export function listRecentCallSessions(limit: number = 20): CallSession[] {
  return Array.from(callSessions.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

export function getTwilioConfigStatus() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  const userNumber = process.env.JARVIS_USER_PHONE_NUMBER;

  return {
    isConfigured: Boolean(accountSid && authToken && fromNumber),
    hasAccountSid: Boolean(accountSid && accountSid.startsWith("AC")),
    hasAuthToken: Boolean(authToken && authToken.length > 5),
    fromNumber: fromNumber || null,
    defaultUserNumber: userNumber || null,
  };
}

export function updateTwilioCredentials(
  accountSid?: string,
  authToken?: string,
  fromNumber?: string,
  userNumber?: string
): { success: boolean; isConfigured: boolean } {
  if (accountSid && accountSid.trim()) {
    process.env.TWILIO_ACCOUNT_SID = accountSid.trim();
  }
  if (authToken && authToken.trim()) {
    process.env.TWILIO_AUTH_TOKEN = authToken.trim();
  }
  if (fromNumber && fromNumber.trim()) {
    process.env.TWILIO_PHONE_NUMBER = fromNumber.trim();
  }
  if (userNumber && userNumber.trim()) {
    process.env.JARVIS_USER_PHONE_NUMBER = userNumber.trim();
  }

  return {
    success: true,
    isConfigured: Boolean(
      process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_PHONE_NUMBER
    ),
  };
}

function formatE164(phone: string): string {
  if (!phone) return "";
  let cleaned = phone.replace(/[^\d+]/g, "");
  if (!cleaned.startsWith("+")) {
    if (cleaned.length === 10) {
      if (
        cleaned.startsWith("6") ||
        cleaned.startsWith("7") ||
        cleaned.startsWith("8") ||
        cleaned.startsWith("9")
      ) {
        cleaned = `+91${cleaned}`;
      } else {
        cleaned = `+1${cleaned}`;
      }
    } else {
      cleaned = `+${cleaned}`;
    }
  }
  return cleaned;
}

/**
 * Minimal call trigger interface required by prompt:
 * triggerJarvisPhoneCall({ reason, eventId, conversationId, context, priority, toPhoneNumber })
 *
 * JARVIS EVENT -> triggerJarvisPhoneCall() -> Twilio -> Mobile Phone
 */
export async function triggerJarvisPhoneCall(
  params: TriggerPhoneCallParams
): Promise<{
  success: boolean;
  callSessionId: string;
  callSid?: string;
  state: CallLifecycleState;
  to: string;
  error?: string;
}> {
  const {
    reason,
    eventId = `event_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    conversationId,
    taskId,
    context = {},
    priority = "normal",
    toPhoneNumber,
    appBaseUrl,
  } = params;

  // 1. Rate limiting & Duplicate-call protection
  const now = Date.now();
  const lastTriggerTime = eventCooldowns.get(eventId);
  if (lastTriggerTime && now - lastTriggerTime < 30000) {
    const existingSession = Array.from(callSessions.values()).find(
      (s) => s.eventId === eventId && s.state !== "COMPLETED" && s.state !== "FAILED"
    );
    if (existingSession) {
      console.warn(`Duplicate trigger rejected for eventId: ${eventId}`);
      return {
        success: false,
        callSessionId: existingSession.callSessionId,
        callSid: existingSession.callSid,
        state: existingSession.state,
        to: existingSession.to,
        error: `Active call already exists for event: ${eventId}`,
      };
    }
  }

  // 2. Configuration & Number Normalization check
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const rawFrom = process.env.TWILIO_PHONE_NUMBER || "";
  const rawTarget = toPhoneNumber || process.env.JARVIS_USER_PHONE_NUMBER || "";

  const fromNumber = formatE164(rawFrom);
  const targetNumber = formatE164(rawTarget);

  if (!accountSid || !authToken || !fromNumber) {
    const errorMsg =
      "Twilio credentials missing. Please configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in the Phone Settings or environment variables.";
    console.warn("Twilio call trigger notice:", errorMsg);
    return {
      success: false,
      callSessionId: "",
      state: "FAILED",
      to: targetNumber || "unknown",
      error: errorMsg,
    };
  }

  if (!targetNumber) {
    const errorMsg =
      "Destination phone number missing. Please provide a destination mobile number in the Phone Settings or JARVIS_USER_PHONE_NUMBER.";
    console.warn("Twilio call trigger notice:", errorMsg);
    return {
      success: false,
      callSessionId: "",
      state: "FAILED",
      to: "undefined",
      error: errorMsg,
    };
  }

  // 3. Create call session record
  const callSessionId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const sessionRecord: CallSession = {
    callSessionId,
    eventId,
    conversationId,
    taskId,
    reason,
    priority,
    context,
    state: "REQUESTED",
    to: targetNumber,
    from: fromNumber,
    createdAt: now,
    updatedAt: now,
  };
  callSessions.set(callSessionId, sessionRecord);
  eventCooldowns.set(eventId, now);
  broadcastCallState(sessionRecord);

  // 4. Resolve Base URL for webhooks (prefer public APP_URL over local host)
  let baseUrl = process.env.APP_URL || "";
  if (!baseUrl || baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1")) {
    if (appBaseUrl && !appBaseUrl.includes("localhost") && !appBaseUrl.includes("127.0.0.1")) {
      baseUrl = appBaseUrl;
    }
  }
  baseUrl = baseUrl.replace(/\/$/, "");
  if (baseUrl && !baseUrl.startsWith("http")) {
    baseUrl = `https://${baseUrl}`;
  }

  const voiceUrl = `${baseUrl}/api/twilio/voice?callSessionId=${encodeURIComponent(callSessionId)}`;
  const statusCallbackUrl = `${baseUrl}/api/twilio/status`;

  try {
    const client = twilio(accountSid, authToken);

    console.log(`Initiating real Twilio outbound call to ${targetNumber} from ${fromNumber}...`);
    sessionRecord.state = "INITIATING";
    sessionRecord.updatedAt = Date.now();
    broadcastCallState(sessionRecord);

    const callPayload: any = {
      to: targetNumber,
      from: fromNumber,
      url: voiceUrl,
    };

    // Only attach statusCallback if not on localhost
    if (
      statusCallbackUrl &&
      !statusCallbackUrl.includes("localhost") &&
      !statusCallbackUrl.includes("127.0.0.1")
    ) {
      callPayload.statusCallback = statusCallbackUrl;
      callPayload.statusCallbackMethod = "POST";
    }

    const call = await client.calls.create(callPayload);

    sessionRecord.callSid = call.sid;
    sessionRecord.updatedAt = Date.now();
    console.log(`Twilio call initiated. CallSid: ${call.sid}, Status: ${call.status}`);
    broadcastCallState(sessionRecord);

    return {
      success: true,
      callSessionId,
      callSid: call.sid,
      state: "INITIATING",
      to: targetNumber,
    };
  } catch (err: any) {
    console.warn("Twilio API calls.create notice:", err?.message || err);
    sessionRecord.state = "FAILED";
    sessionRecord.error = err?.message || "Twilio call creation failed";
    sessionRecord.updatedAt = Date.now();
    broadcastCallState(sessionRecord);

    return {
      success: false,
      callSessionId,
      state: "FAILED",
      to: targetNumber,
      error: sessionRecord.error,
    };
  }
}

/**
 * Handles incoming Twilio Voice Webhook:
 * Returns TwiML with <Connect><Stream .../></Connect> to route real-time audio.
 */
export function generateVoiceTwiml(
  callSessionId: string,
  host: string
): string {
  const session = callSessions.get(callSessionId);
  const reasonParam = session ? encodeURIComponent(session.reason) : "conversation";
  const protocol = host.includes("localhost") || host.includes("127.0.0.1") ? "ws" : "wss";
  const streamUrl = `${protocol}://${host}/api/twilio/media-stream`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}">
      <Parameter name="callSessionId" value="${callSessionId}" />
      <Parameter name="reason" value="${reasonParam}" />
    </Stream>
  </Connect>
</Response>`;
}

/**
 * Handles Twilio Status Callback:
 * Updates actual provider confirmed lifecycle states.
 */
export function updateCallStatusFromWebhook(body: Record<string, any>): CallSession | null {
  const callSid = body.CallSid;
  if (!callSid) return null;

  const session = getCallSessionBySid(callSid);
  if (!session) {
    console.log(`Received status callback for unknown CallSid: ${callSid}`);
    return null;
  }

  const twilioStatus = String(body.CallStatus || "").toLowerCase();
  const now = Date.now();
  session.updatedAt = now;

  switch (twilioStatus) {
    case "initiated":
    case "queued":
      session.state = "INITIATING";
      break;
    case "ringing":
      session.state = "RINGING";
      break;
    case "in-progress":
      if (session.state !== "LIVE") {
        session.state = "ANSWERED";
      }
      if (!session.answeredAt) {
        session.answeredAt = now;
      }
      break;
    case "completed":
      session.state = "COMPLETED";
      session.completedAt = now;
      if (body.CallDuration) {
        session.duration = parseInt(body.CallDuration, 10);
      }
      break;
    case "busy":
      session.state = "BUSY";
      break;
    case "no-answer":
      session.state = "NO_ANSWER";
      break;
    case "failed":
      session.state = "FAILED";
      session.error = body.ErrorMessage || "Call failed";
      break;
    case "canceled":
      session.state = "REJECTED";
      break;
  }

  console.log(`Twilio Call ${callSid} state transitioned to: ${session.state}`);
  broadcastCallState(session);
  return session;
}

/**
 * Bridges the Twilio Media Stream WebSocket to the EXISTING JARVIS BRAIN + VOICE.
 *
 * PHONE AUDIO (8kHz mulaw)
 *   ↓ decode & resample
 * EXISTING JARVIS AUDIO INPUT (16kHz PCM)
 *   ↓
 * EXISTING JARVIS BRAIN (Gemini Live session)
 *   ↓
 * EXISTING JARVIS VOICE OUTPUT (24kHz PCM)
 *   ↓ downsample & encode
 * PHONE (8kHz mulaw)
 */
export async function bridgeTwilioMediaStream(
  twilioWs: WebSocket,
  callSessionId: string,
  ai: GoogleGenAI,
  assistantTools: any[],
  baseSystemInstruction: string
): Promise<void> {
  const sessionRecord = callSessions.get(callSessionId);
  console.log(`Bridging Twilio Media Stream for session: ${callSessionId}`);

  let streamSid = "";
  let geminiSession: any = null;
  let isClosing = false;

  const phoneSystemInstruction = `${baseSystemInstruction}
IMPORTANT OUTBOUND PHONE CONTEXT:
You have just initiated a real outbound telephone call to the user.
Reason for call: "${sessionRecord?.reason || "Checking in on urgent matters"}".
Priority: "${sessionRecord?.priority || "normal"}".
Context details: ${JSON.stringify(sessionRecord?.context || {})}.
Greet the user naturally with your signature confident, witty girlfriend persona, and immediately tell them why you called in 1 or 2 punchy, spoken sentences. Keep all spoken responses crisp and optimized for phone audio.`;

  try {
    // Connect to the EXISTING JARVIS BRAIN + VOICE via Gemini Live
    geminiSession = await ai.live.connect({
      model: "gemini-3.8-live",
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: "Aoede",
            },
          },
        },
        systemInstruction: phoneSystemInstruction,
        tools: assistantTools,
      },
      callbacks: {
        onmessage: (liveMessage: any) => {
          try {
            // 1. Voice audio output from Gemini Live (24kHz PCM linear)
            const modelParts = liveMessage.serverContent?.modelTurn?.parts;
            if (modelParts && modelParts.length > 0) {
              for (const part of modelParts) {
                if (part.inlineData?.data && streamSid) {
                  // Decode 24kHz base64 PCM16
                  const pcm24kBuffer = Buffer.from(part.inlineData.data, "base64");
                  const pcm24k = new Int16Array(
                    pcm24kBuffer.buffer,
                    pcm24kBuffer.byteOffset,
                    pcm24kBuffer.byteLength / 2
                  );

                  // Downsample 24kHz -> 8kHz linear PCM
                  const pcm8k = resample24kTo8k(pcm24k);

                  // Encode 8kHz linear PCM -> 8kHz mu-law
                  const mulawBuffer = encodeLinearToUlaw(pcm8k);

                  // Send to Twilio telephone audio stream
                  if (twilioWs.readyState === WebSocket.OPEN) {
                    twilioWs.send(
                      JSON.stringify({
                        event: "media",
                        streamSid,
                        media: {
                          payload: mulawBuffer.toString("base64"),
                        },
                      })
                    );
                  }
                }
              }
            }

            // 2. Interruption from model
            if (liveMessage.serverContent?.interrupted && streamSid) {
              if (twilioWs.readyState === WebSocket.OPEN) {
                twilioWs.send(
                  JSON.stringify({
                    event: "clear",
                    streamSid,
                  })
                );
              }
            }
          } catch (err) {
            console.error("Error processing Gemini audio to Twilio:", err);
          }
        },
        onclose: (e: any) => {
          console.log("Gemini phone session closed:", e?.reason || e);
        },
        onerror: (err: any) => {
          console.warn("Gemini phone session error:", err?.message || err);
        },
      },
    });

    if (sessionRecord) {
      sessionRecord.state = "CONNECTED";
      sessionRecord.updatedAt = Date.now();
      broadcastCallState(sessionRecord);
    }

    // Handle incoming messages from Twilio Media Stream WebSocket
    twilioWs.on("message", (raw: any) => {
      try {
        const msg = JSON.parse(raw.toString());

        switch (msg.event) {
          case "start":
            streamSid = msg.start?.streamSid || msg.streamSid;
            console.log(`Twilio Stream started. StreamSid: ${streamSid}`);
            if (sessionRecord) {
              sessionRecord.state = "LIVE";
              sessionRecord.updatedAt = Date.now();
              broadcastCallState(sessionRecord);
            }
            break;

          case "media":
            // Incoming telephone microphone audio (8kHz mu-law)
            if (msg.media?.payload && geminiSession) {
              const mulawBuffer = Buffer.from(msg.media.payload, "base64");

              // Decode 8kHz mu-law -> 8kHz linear PCM16
              const pcm8k = decodeUlawToLinear(mulawBuffer);

              // Upsample 8kHz linear PCM16 -> 16kHz linear PCM16
              const pcm16k = resample8kTo16k(pcm8k);

              // Convert to base64 buffer for Gemini Live
              const pcm16kBuffer = Buffer.from(
                pcm16k.buffer,
                pcm16k.byteOffset,
                pcm16k.byteLength
              );
              const base64Pcm16k = pcm16kBuffer.toString("base64");

              // Stream directly into EXISTING JARVIS BRAIN
              try {
                geminiSession.sendRealtimeInput({
                  audio: {
                    data: base64Pcm16k,
                    mimeType: "audio/pcm;rate=16000",
                  },
                });
              } catch (sendErr) {
                // Ignore transient write errors if session closing
              }
            }
            break;

          case "stop":
            console.log(`Twilio Stream stopped for session: ${callSessionId}`);
            if (sessionRecord && sessionRecord.state !== "COMPLETED") {
              sessionRecord.state = "COMPLETED";
              sessionRecord.completedAt = Date.now();
              broadcastCallState(sessionRecord);
            }
            break;
        }
      } catch (parseErr) {
        console.error("Twilio message parse error:", parseErr);
      }
    });

    twilioWs.on("close", () => {
      console.log(`Twilio WebSocket closed for session: ${callSessionId}`);
      isClosing = true;
      if (sessionRecord && sessionRecord.state !== "COMPLETED") {
        sessionRecord.state = "COMPLETED";
        sessionRecord.completedAt = Date.now();
        broadcastCallState(sessionRecord);
      }
      if (geminiSession && typeof geminiSession.close === "function") {
        try {
          geminiSession.close();
        } catch (_) {}
      }
    });
  } catch (initErr: any) {
    console.error("Failed to connect Gemini session for phone call:", initErr);
    if (sessionRecord) {
      sessionRecord.state = "FAILED";
      sessionRecord.error = initErr?.message || "Failed to initialize phone voice session";
      broadcastCallState(sessionRecord);
    }
  }
}
