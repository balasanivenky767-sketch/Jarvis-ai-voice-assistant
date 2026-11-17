import React from "react";
import { X, Volume2, Cpu, Palette, Sparkles, Brain, Check } from "lucide-react";

export type AuraTheme = "neon-rose" | "cyber-cyan" | "electric-violet" | "emerald-matrix" | "amber-gold";

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  voice: string;
  onVoiceChange: (voice: string) => void;
  model: string;
  onModelChange: (model: string) => void;
  auraTheme: AuraTheme;
  onAuraThemeChange: (theme: AuraTheme) => void;
  highThinkingMode: boolean;
  onToggleHighThinking: () => void;
  accentColor: string;
}

export const THEMES: { id: AuraTheme; name: string; primary: string; secondary: string }[] = [
  { id: "neon-rose", name: "Neon Rose (Sassy)", primary: "#f43f5e", secondary: "#fb7185" },
  { id: "cyber-cyan", name: "Cyber Cyan (Futuristic)", primary: "#06b6d4", secondary: "#38bdf8" },
  { id: "electric-violet", name: "Electric Violet (Mystic)", primary: "#a855f7", secondary: "#c084fc" },
  { id: "emerald-matrix", name: "Emerald Matrix (Tactical)", primary: "#10b981", secondary: "#34d399" },
  { id: "amber-gold", name: "Solar Amber (Iron-Man)", primary: "#f59e0b", secondary: "#fbbf24" },
];

export const VOICES = [
  { id: "Aoede", label: "Aoede", desc: "Breezy, witty, flirty female voice (Default)" },
  { id: "Kore", label: "Kore", desc: "Crisp, confident, sleek female voice" },
  { id: "Zephyr", label: "Zephyr", desc: "Smooth, articulate voice" },
  { id: "Puck", label: "Puck", desc: "Playful, energetic voice" },
];

export const MODELS = [
  { id: "gemini-3.8-live", label: "gemini-3.8-live", tag: "Flagship Native Audio (Fast & Stable)" },
  { id: "gemini-3.1-flash-live-preview", label: "gemini-3.1-flash-live-preview", tag: "Flash Live Preview" },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  voice,
  onVoiceChange,
  model,
  onModelChange,
  auraTheme,
  onAuraThemeChange,
  highThinkingMode,
  onToggleHighThinking,
  accentColor,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-3xl bg-slate-950 border border-white/10 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div
              className="w-3 h-3 rounded-full animate-ping"
              style={{ backgroundColor: accentColor }}
            />
            <h3 className="text-lg font-bold font-tech uppercase tracking-wider text-white">
              System Core Configuration
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-5 space-y-6">
          {/* Persona Card */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-rose-950/30 to-violet-950/20 border border-rose-500/20">
            <div className="flex items-center gap-2 text-rose-400 mb-2">
              <Sparkles className="w-4 h-4" />
              <span className="text-xs font-mono-code uppercase font-semibold">Active Persona</span>
            </div>
            <h4 className="text-sm font-bold text-white mb-1">Jarvis (Sassy Girlfriend Persona)</h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              Young, confident, playful, and casually flirty. Speaks concisely with bold one-liners,
              light sarcasm, and effortless charm. Completely hands-free and voice-driven.
            </p>
          </div>

          {/* High Thinking Mode Toggle */}
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/5 flex items-center justify-between">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-violet-500/20 text-violet-400 mt-0.5">
                <Brain className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-white">High Thinking Reasoner</h4>
                  <span className="text-[10px] font-mono-code px-1.5 py-0.5 rounded bg-violet-500/30 text-violet-300">
                    Gemini 3.1 Pro
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Allows Jarvis to route complex STEM and logic challenges to Gemini 3.1 Pro Preview with ThinkingLevel.HIGH.
                </p>
              </div>
            </div>
            <button
              onClick={onToggleHighThinking}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                highThinkingMode ? "bg-violet-600" : "bg-slate-700"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  highThinkingMode ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Voice Selection */}
          <div>
            <label className="flex items-center gap-2 text-xs font-mono-code uppercase text-slate-400 mb-2.5">
              <Volume2 className="w-4 h-4 text-cyan-400" />
              Acoustic Voice Profile
            </label>
            <div className="grid grid-cols-2 gap-2">
              {VOICES.map((v) => (
                <button
                  key={v.id}
                  onClick={() => onVoiceChange(v.id)}
                  className={`p-3 rounded-2xl text-left border transition relative ${
                    voice === v.id
                      ? "border-cyan-500/60 bg-cyan-950/30 text-white"
                      : "border-white/5 bg-slate-900/40 text-slate-400 hover:border-white/20"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold">{v.label}</span>
                    {voice === v.id && <Check className="w-4 h-4 text-cyan-400" />}
                  </div>
                  <span className="text-[11px] text-slate-400 block line-clamp-1">{v.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Aura Theme Selection */}
          <div>
            <label className="flex items-center gap-2 text-xs font-mono-code uppercase text-slate-400 mb-2.5">
              <Palette className="w-4 h-4 text-rose-400" />
              Holographic Aura Theme
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onAuraThemeChange(t.id)}
                  className={`p-2.5 rounded-2xl flex items-center gap-3 border transition ${
                    auraTheme === t.id
                      ? "border-white/40 bg-white/10 text-white"
                      : "border-white/5 bg-slate-900/40 text-slate-400 hover:border-white/20"
                  }`}
                >
                  <div
                    className="w-5 h-5 rounded-full shadow-md"
                    style={{ backgroundColor: t.primary }}
                  />
                  <span className="text-xs font-semibold">{t.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Model Selection */}
          <div>
            <label className="flex items-center gap-2 text-xs font-mono-code uppercase text-slate-400 mb-2.5">
              <Cpu className="w-4 h-4 text-emerald-400" />
              Live API Engine Model
            </label>
            <div className="space-y-2">
              {MODELS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => onModelChange(m.id)}
                  className={`w-full p-3 rounded-2xl flex items-center justify-between border transition text-left ${
                    model === m.id
                      ? "border-emerald-500/60 bg-emerald-950/30 text-white"
                      : "border-white/5 bg-slate-900/40 text-slate-400 hover:border-white/20"
                  }`}
                >
                  <div>
                    <span className="text-sm font-semibold font-mono-code">{m.label}</span>
                    <span className="text-[10px] block text-slate-400">{m.tag}</span>
                  </div>
                  {model === m.id && <Check className="w-4 h-4 text-emerald-400" />}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-white/10 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-white text-black font-semibold text-sm hover:bg-slate-200 transition"
          >
            Apply & Close
          </button>
        </div>
      </div>
    </div>
  );
};
