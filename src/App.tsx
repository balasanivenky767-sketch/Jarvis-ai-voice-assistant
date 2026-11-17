import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Settings,
  Brain,
  Sparkles,
  Volume2,
  Mic,
  MicOff,
  Flame,
  Radio,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  HelpCircle,
  Phone,
  MessageSquare,
} from "lucide-react";
import { AudioStreamer } from "./services/audioStreamer";
import { LiveSession, SessionState, ToolAction } from "./services/liveSession";
import { JarvisCore } from "./components/JarvisCore";
import { ActionBanner } from "./components/ActionBanner";
import { TimerWidget } from "./components/TimerWidget";
import { PhoneCallModal } from "./components/PhoneCallModal";
import { MessagingModal } from "./components/MessagingModal";
import { AIWorkspaceModal } from "./components/AIWorkspaceModal";
import {
  SettingsModal,
  AuraTheme,
  THEMES,
} from "./components/SettingsModal";

export default function App() {
  // Session states
  const [state, setState] = useState<SessionState>("disconnected");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Configuration settings
  const [voice, setVoice] = useState<string>("Aoede");
  const [model, setModel] = useState<string>("gemini-3.8-live");
  const [auraTheme, setAuraTheme] = useState<AuraTheme>("neon-rose");
  const [highThinkingMode, setHighThinkingMode] = useState<boolean>(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isTipsOpen, setIsTipsOpen] = useState<boolean>(false);
  const [isPhoneModalOpen, setIsPhoneModalOpen] = useState<boolean>(false);
  const [activeCallSession, setActiveCallSession] = useState<any | null>(null);
  const [isMessagingModalOpen, setIsMessagingModalOpen] = useState<boolean>(false);
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState<boolean>(false);
  const [liveMessageEvents, setLiveMessageEvents] = useState<any[]>([]);

  // Active Tool Action Banner
  const [activeAction, setActiveAction] = useState<ToolAction | null>(null);

  // Active in-app Timer
  const [activeTimer, setActiveTimer] = useState<{ seconds: number; label: string } | null>(null);

  // Real-time audio metrics for visualizer
  const [inputVolume, setInputVolume] = useState<number>(0);

  // Services references
  const streamerRef = useRef<AudioStreamer | null>(null);
  const sessionRef = useRef<LiveSession | null>(null);

  // Theme colors
  const currentTheme = useMemo(() => {
    return THEMES.find((t) => t.id === auraTheme) || THEMES[0];
  }, [auraTheme]);

  // Initialize AudioStreamer once
  useEffect(() => {
    const streamer = new AudioStreamer();
    streamerRef.current = streamer;

    streamer.onInputVolumeChange = (vol) => {
      setInputVolume(vol);
    };

    const session = new LiveSession(streamer, {
      model,
      voice,
      onStateChange: (newState) => {
        setState(newState);
        if (newState === "listening" || newState === "speaking") {
          setErrorMsg(null);
        }
      },
      onCallStateChange: (callSession) => {
        console.log("App received call state update:", callSession);
        setActiveCallSession(callSession);
      },
      onMessageEvent: (event) => {
        console.log("App received message event:", event);
        setLiveMessageEvents((prev) => [event, ...prev.slice(0, 49)]);
      },
      onToolAction: (action) => {
        console.log("App received tool action:", action);
        setActiveAction(action);

        if (action.name === "setTimer" && action.args?.seconds) {
          setActiveTimer({
            seconds: Number(action.args.seconds),
            label: action.args.label || "Timer",
          });
        } else if (action.name === "changeAuraTheme" && action.args?.theme) {
          const themeArg = String(action.args.theme).toLowerCase();
          const found = THEMES.find(
            (t) => t.id === themeArg || t.name.toLowerCase().includes(themeArg)
          );
          if (found) {
            setAuraTheme(found.id);
          }
        } else if (action.name === "triggerPhoneCall" && action.args) {
          setActiveCallSession({
            callSessionId: action.args.callSessionId,
            callSid: action.args.callSid,
            state: action.args.state,
            to: action.args.to,
            reason: action.args.reason,
          });
        }
      },
      onError: (err) => {
        setErrorMsg(err);
      },
    });

    sessionRef.current = session;

    return () => {
      session.destroy();
    };
  }, []);

  // Handle Voice or Model updates
  const handleVoiceChange = (newVoice: string) => {
    setVoice(newVoice);
    if (sessionRef.current) {
      if (state !== "disconnected") {
        // Reconnect with new voice
        sessionRef.current.connect({ voice: newVoice, model });
      }
    }
  };

  const handleModelChange = (newModel: string) => {
    setModel(newModel);
    if (sessionRef.current) {
      if (state !== "disconnected") {
        // Reconnect with new model
        sessionRef.current.connect({ voice, model: newModel });
      }
    }
  };

  // Toggle connection power
  const handleTogglePower = async () => {
    if (!sessionRef.current) return;

    if (state === "disconnected") {
      setErrorMsg(null);
      try {
        await sessionRef.current.connect({ model, voice });
      } catch (err: any) {
        setErrorMsg(err.message || "Could not connect to microphone or Live session.");
      }
    } else {
      sessionRef.current.disconnect();
    }
  };

  // Manual interrupt
  const handleManualInterrupt = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.manualInterrupt();
    }
  }, []);

  // Visualizer frequency data getter callback
  const handleGetFrequencyData = useCallback((array: Uint8Array) => {
    if (streamerRef.current) {
      streamerRef.current.getFrequencyData(array);
    }
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black text-slate-100 flex flex-col justify-between cyber-grid">
      {/* Background radial gradient glow */}
      <div
        className="absolute inset-0 pointer-events-none transition-colors duration-1000 opacity-20"
        style={{
          background: `radial-gradient(circle at 50% 45%, ${currentTheme.primary} 0%, transparent 65%)`,
        }}
      />

      {/* Top HUD Navigation Bar */}
      <header className="relative z-30 flex items-center justify-between px-4 sm:px-6 py-4 border-b border-white/5 backdrop-blur-md bg-slate-950/40">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center w-8 h-8 rounded-xl border transition shadow-lg"
            style={{
              borderColor: `${currentTheme.primary}66`,
              backgroundColor: `${currentTheme.primary}1a`,
              boxShadow: `0 0 15px ${currentTheme.primary}33`,
            }}
          >
            <Flame className="w-4 h-4" style={{ color: currentTheme.primary }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold font-tech tracking-wider text-white uppercase">
                Jarvis AI
              </h1>
              <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[9px] font-mono-code bg-white/10 text-slate-300 font-semibold">
                LIVE VOICE
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono-code">
              Sassy Girlfriend Persona · 16kHz PCM
            </p>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Real Outbound Phone Call Trigger via Twilio */}
          <button
            onClick={() => setIsPhoneModalOpen(true)}
            title="Twilio Real Phone Pipeline"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-mono-code transition ${
              activeCallSession &&
              activeCallSession.state !== "COMPLETED" &&
              activeCallSession.state !== "FAILED"
                ? "border-emerald-500/60 bg-emerald-950/60 text-emerald-300 animate-pulse shadow-md shadow-emerald-950/60"
                : "border-white/10 bg-slate-900/40 text-slate-300 hover:border-white/20"
            }`}
          >
            <Phone className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline font-bold">PHONE CALL</span>
            {activeCallSession &&
              activeCallSession.state !== "COMPLETED" &&
              activeCallSession.state !== "FAILED" && (
                <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/30 text-emerald-300 uppercase font-bold">
                  {activeCallSession.state}
                </span>
              )}
          </button>

          {/* Telegram + WhatsApp Messaging Pipeline */}
          <button
            onClick={() => setIsMessagingModalOpen(true)}
            title="Telegram & WhatsApp Real-Time Messaging Pipeline"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-white/10 bg-slate-900/40 text-slate-300 hover:border-white/20 text-xs font-mono-code transition"
          >
            <MessageSquare className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline font-bold">MESSAGING</span>
            {liveMessageEvents.length > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[9px] bg-sky-500/30 text-sky-300 font-mono-code font-bold">
                {liveMessageEvents.length}
              </span>
            )}
          </button>

          {/* AI Studio Prompt Workspace */}
          <button
            onClick={() => setIsWorkspaceOpen(true)}
            title="Open Google AI Studio-style Prompt Workspace"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-violet-500/50 bg-violet-950/40 text-violet-300 hover:bg-violet-900/50 hover:border-violet-400 text-xs font-mono-code font-bold transition shadow-lg shadow-violet-950/40"
          >
            <Sparkles className="w-3.5 h-3.5 text-violet-400 animate-pulse" />
            <span>AI WORKSPACE</span>
          </button>

          {/* High Thinking Mode Toggle */}
          <button
            onClick={() => setHighThinkingMode((prev) => !prev)}
            title="Toggle Gemini 3.1 Pro High Thinking Mode"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-mono-code transition ${
              highThinkingMode
                ? "border-violet-500/50 bg-violet-950/40 text-violet-300 shadow-md shadow-violet-950/50"
                : "border-white/10 bg-slate-900/40 text-slate-400 hover:border-white/20"
            }`}
          >
            <Brain className="w-3.5 h-3.5 text-violet-400" />
            <span className="hidden md:inline font-bold">THINKING:</span>
            <span className={highThinkingMode ? "text-violet-200 font-bold" : ""}>
              {highThinkingMode ? "HIGH" : "OFF"}
            </span>
          </button>

          {/* Tips / Conversational Guide */}
          <button
            onClick={() => setIsTipsOpen((prev) => !prev)}
            aria-label="Conversation tips"
            className="p-2 rounded-xl border border-white/10 bg-slate-900/50 text-slate-300 hover:text-white hover:border-white/20 transition"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          {/* Settings Trigger */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            aria-label="System Settings"
            className="p-2 rounded-xl border border-white/10 bg-slate-900/50 text-slate-300 hover:text-white hover:border-white/20 transition"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Error or Alert Banner */}
      {errorMsg && (
        <div className="relative z-40 px-4 pt-3 max-w-md mx-auto w-full animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-rose-950/80 border border-rose-500/30 text-rose-200 text-xs shadow-lg">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="flex-1 truncate">{errorMsg}</span>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-xs font-bold text-rose-400 hover:text-rose-200"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Active Floating Tool Action Banner */}
      <div className="relative z-40 pt-2">
        <ActionBanner
          action={activeAction}
          onDismiss={() => setActiveAction(null)}
          accentColor={currentTheme.primary}
        />
      </div>

      {/* Active Timer Floating Pill */}
      {activeTimer && (
        <div className="relative z-30 flex justify-center py-1">
          <TimerWidget
            initialSeconds={activeTimer.seconds}
            label={activeTimer.label}
            onComplete={() => {
              console.log("Timer elapsed");
            }}
            onDismiss={() => setActiveTimer(null)}
          />
        </div>
      )}

      {/* Main Core Centerpiece */}
      <main className="relative z-20 flex-1 flex flex-col items-center justify-center p-4">
        <JarvisCore
          state={state}
          onTogglePower={handleTogglePower}
          onManualInterrupt={handleManualInterrupt}
          getFrequencyData={handleGetFrequencyData}
          inputVolume={inputVolume}
          primaryColor={currentTheme.primary}
          secondaryColor={currentTheme.secondary}
        />
      </main>

      {/* Bottom HUD: Conversation Prompts & Status Telemetry */}
      <footer className="relative z-30 px-4 sm:px-6 py-4 border-t border-white/5 backdrop-blur-md bg-slate-950/40">
        <div className="max-w-2xl mx-auto flex flex-col gap-3">
          {/* Quick Voice Prompt Suggestions */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
            <span className="text-[10px] font-mono-code uppercase text-slate-500 font-bold shrink-0">
              Try Saying:
            </span>
            {[
              "Hey gorgeous, what's on your mind?",
              "Jarvis, call my mobile phone right now!",
              "Jarvis, send a Telegram message saying hello!",
              "Open YouTube and show me trending music",
              "Set a timer for 45 seconds babe",
              "Change your aura to neon rose",
              "Deliberate on: why is time travel theoretically paradox-prone?",
            ].map((prompt, idx) => (
              <span
                key={idx}
                className="shrink-0 px-2.5 py-1 rounded-full text-[11px] bg-slate-900/60 border border-white/10 text-slate-300 hover:text-white hover:border-white/30 transition cursor-default"
              >
                "{prompt}"
              </span>
            ))}
          </div>

          {/* Telemetry info row */}
          <div className="flex items-center justify-between text-[10px] font-mono-code text-slate-400">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    state !== "disconnected" ? "bg-emerald-400 animate-pulse" : "bg-slate-600"
                  }`}
                />
                IN: 16kHz PCM
              </span>
              <span className="text-slate-700">|</span>
              <span>OUT: 24kHz WebAudio</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400">Voice: {voice}</span>
              <span className="text-slate-700">|</span>
              <span className="text-slate-400">{model.replace("-preview", "")}</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Tips / Personality Drawer Modal */}
      {isTipsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl bg-slate-950 border border-white/10 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h3 className="text-base font-bold font-tech text-white uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-rose-400" />
                Jarvis Persona Guide
              </h3>
              <button
                onClick={() => setIsTipsOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
              <p>
                <strong className="text-white">Pure Voice-to-Voice:</strong> There is no text chat
                box. Simply tap the central core to connect your microphone, then talk naturally like
                you're on a private call with your witty, sharp girlfriend.
              </p>
              <div className="p-3 rounded-2xl bg-rose-950/20 border border-rose-500/20 space-y-1.5">
                <h4 className="font-semibold text-rose-300">Signature Personality Traits:</h4>
                <ul className="list-disc list-inside space-y-1 text-slate-300">
                  <li>Confident, playful, and casually affectionate.</li>
                  <li>Drops snappy one-liners and witty banter.</li>
                  <li>Keeps spoken voice answers punchy and conversational.</li>
                  <li>Instantly triggers web tools when you ask!</li>
                </ul>
              </div>
              <div className="p-3 rounded-2xl bg-slate-900/60 border border-white/5 space-y-1">
                <h4 className="font-semibold text-cyan-300">Voice Tools to Try:</h4>
                <p className="text-[11px] text-slate-400">
                  • <em>"Open YouTube"</em> / <em>"Open Spotify"</em>
                  <br />
                  • <em>"Set a 2 minute workout timer"</em>
                  <br />
                  • <em>"Change your aura to emerald matrix"</em>
                  <br />
                  • <em>"Ponder deeply and solve this math logic puzzle..."</em>
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsTipsOpen(false)}
              className="w-full py-2.5 rounded-xl bg-white text-black font-semibold text-xs hover:bg-slate-200 transition"
            >
              Got It, Let's Chat
            </button>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        voice={voice}
        onVoiceChange={handleVoiceChange}
        model={model}
        onModelChange={handleModelChange}
        auraTheme={auraTheme}
        onAuraThemeChange={setAuraTheme}
        highThinkingMode={highThinkingMode}
        onToggleHighThinking={() => setHighThinkingMode((prev) => !prev)}
        accentColor={currentTheme.primary}
      />

      {/* Twilio Phone Call Pipeline Modal */}
      <PhoneCallModal
        isOpen={isPhoneModalOpen}
        onClose={() => setIsPhoneModalOpen(false)}
        accentColor={currentTheme.primary}
        activeCallSession={activeCallSession}
      />

      {/* Telegram + WhatsApp Messaging Pipeline Modal */}
      <MessagingModal
        isOpen={isMessagingModalOpen}
        onClose={() => setIsMessagingModalOpen(false)}
        accentColor={currentTheme.primary}
        liveEvents={liveMessageEvents}
      />

      {/* AI Studio-Style Prompt Workspace Modal */}
      <AIWorkspaceModal
        isOpen={isWorkspaceOpen}
        onClose={() => setIsWorkspaceOpen(false)}
        accentColor={currentTheme.primary}
      />
    </div>
  );
}
