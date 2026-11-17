import { AudioStreamer } from "./audioStreamer";

export type SessionState = "disconnected" | "connecting" | "listening" | "speaking";

export interface ToolAction {
  id: string;
  name: string;
  args: Record<string, any>;
  timestamp: number;
}

export interface LiveSessionOptions {
  model?: string;
  voice?: string;
  onStateChange?: (state: SessionState) => void;
  onToolAction?: (action: ToolAction) => void;
  onCallStateChange?: (callSession: any) => void;
  onMessageEvent?: (event: any) => void;
  onError?: (error: string) => void;
  onInterrupted?: () => void;
}

export class LiveSession {
  private ws: WebSocket | null = null;
  private streamer: AudioStreamer;
  private state: SessionState = "disconnected";
  private options: LiveSessionOptions;
  private isIntentionalDisconnect: boolean = false;
  private pingInterval: any = null;

  constructor(streamer: AudioStreamer, options: LiveSessionOptions = {}) {
    this.streamer = streamer;
    this.options = {
      model: "gemini-3.1-flash-live-preview",
      voice: "Aoede",
      ...options,
    };

    this.setupStreamerListeners();
  }

  private setupStreamerListeners(): void {
    // When microphone produces PCM16 audio, send to Gemini Live
    this.streamer.onAudioChunk = (base64Chunk, rms) => {
      if (this.state === "listening" || this.state === "speaking") {
        this.sendAudio(base64Chunk);

        // Local barge-in heuristic: if user speaks loudly while Jarvis is speaking, interrupt playback locally
        if (this.state === "speaking" && rms > 0.15) {
          this.streamer.interrupt();
          this.setState("listening");
          if (this.options.onInterrupted) {
            this.options.onInterrupted();
          }
        }
      }
    };

    // When speaker begins playback
    this.streamer.onPlaybackStarted = () => {
      this.setState("speaking");
    };

    // When speaker finishes playing model audio chunks
    this.streamer.onPlaybackEnded = () => {
      if (this.state === "speaking") {
        this.setState("listening");
      }
    };

    this.streamer.onError = (err) => {
      if (this.options.onError) {
        this.options.onError(err.message);
      }
      this.disconnect();
    };
  }

  public getState(): SessionState {
    return this.state;
  }

  private setState(newState: SessionState): void {
    if (this.state === newState) return;
    this.state = newState;
    if (this.options.onStateChange) {
      this.options.onStateChange(newState);
    }
  }

  /**
   * Connects to the Gemini Live session over WebSocket and starts microphone capture.
   */
  public async connect(overrideOptions?: Partial<LiveSessionOptions>): Promise<void> {
    if (this.state !== "disconnected") {
      this.disconnect();
    }

    if (overrideOptions) {
      this.options = { ...this.options, ...overrideOptions };
    }

    this.isIntentionalDisconnect = false;
    this.setState("connecting");

    try {
      // 1. Start audio capture first to ensure permissions
      await this.streamer.startCapture();

      // 2. Connect WebSocket
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.host;
      const model = encodeURIComponent(this.options.model || "gemini-3.1-flash-live-preview");
      const voice = encodeURIComponent(this.options.voice || "Aoede");
      const wsUrl = `${protocol}//${host}/api/live?model=${model}&voice=${voice}`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        // Start ping keepalive
        this.pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 15000);
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleServerMessage(msg);
        } catch (err) {
          console.error("Failed to parse server WS message:", err);
        }
      };

      this.ws.onerror = (err) => {
        console.error("Live WebSocket error:", err);
        if (this.options.onError) {
          this.options.onError("WebSocket connection error");
        }
      };

      this.ws.onclose = (event) => {
        console.log("Live WebSocket closed:", event.code, event.reason);
        this.cleanup();
        if (!this.isIntentionalDisconnect) {
          this.setState("disconnected");
          if (event.code !== 1000 && this.options.onError) {
            this.options.onError(event.reason || "Session ended unexpectedly");
          }
        }
      };
    } catch (err: any) {
      this.disconnect();
      if (this.options.onError) {
        this.options.onError(err.message || "Failed to initialize session");
      }
      throw err;
    }
  }

  private handleServerMessage(msg: Record<string, any>): void {
    switch (msg.type) {
      case "connected":
        // Successfully connected to Live API
        if (msg.model) this.options.model = msg.model;
        this.setState("listening");
        break;

      case "reconnected":
        // Transparent fallback/reconnection to stable model
        if (msg.model) this.options.model = msg.model;
        this.setState("listening");
        break;

      case "audio":
        // Receive 24kHz PCM audio chunk from Gemini Live
        if (msg.data) {
          this.streamer.playChunk(msg.data);
        }
        break;

      case "interrupted":
        // Gemini detected user interruption
        this.streamer.interrupt();
        this.setState("listening");
        if (this.options.onInterrupted) {
          this.options.onInterrupted();
        }
        break;

      case "tool_action":
        // Browser/app action requested by model
        if (this.options.onToolAction) {
          this.options.onToolAction({
            id: msg.id || String(Date.now()),
            name: msg.name,
            args: msg.args || {},
            timestamp: Date.now(),
          });
        }
        break;

      case "call_state":
        // Real-time provider confirmed call lifecycle updates from Twilio
        if (this.options.onCallStateChange && msg.session) {
          this.options.onCallStateChange(msg.session);
        }
        break;

      case "message_event":
        // Real-time Telegram/WhatsApp normalized message event
        if (this.options.onMessageEvent && msg.event) {
          this.options.onMessageEvent(msg.event);
        }
        break;

      case "error":
        console.error("Live session server error:", msg.error);
        if (this.options.onError) {
          this.options.onError(msg.error);
        }
        break;

      case "session_closed":
        this.disconnect();
        break;

      case "pong":
        break;

      default:
        break;
    }
  }

  private sendAudio(base64Data: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "audio",
          data: base64Data,
        })
      );
    }
  }

  public manualInterrupt(): void {
    this.streamer.interrupt();
    this.setState("listening");
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "interrupt" }));
    }
  }

  public disconnect(): void {
    this.isIntentionalDisconnect = true;
    this.cleanup();
    this.setState("disconnected");
  }

  private cleanup(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }

    this.streamer.stopCapture();
    this.streamer.interrupt();
  }

  public destroy(): void {
    this.disconnect();
    this.streamer.destroy();
  }
}
