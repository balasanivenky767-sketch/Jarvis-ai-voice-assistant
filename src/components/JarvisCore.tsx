import React from "react";
import { Mic, MicOff, Power, Radio, Sparkles } from "lucide-react";
import { SessionState } from "../services/liveSession";
import { AudioVisualizerCanvas } from "./AudioVisualizerCanvas";

interface JarvisCoreProps {
  state: SessionState;
  onTogglePower: () => void;
  onManualInterrupt: () => void;
  getFrequencyData: (array: Uint8Array) => void;
  inputVolume: number;
  primaryColor: string;
  secondaryColor: string;
}

export const JarvisCore: React.FC<JarvisCoreProps> = ({
  state,
  onTogglePower,
  onManualInterrupt,
  getFrequencyData,
  inputVolume,
  primaryColor,
  secondaryColor,
}) => {
  const isConnected = state === "listening" || state === "speaking";

  const getStatusText = () => {
    switch (state) {
      case "disconnected":
        return {
          headline: "SYSTEM OFFLINE",
          subtext: "Tap the core to awaken Jarvis",
          tag: "STANDBY",
        };
      case "connecting":
        return {
          headline: "INITIALIZING LINK",
          subtext: "Calibrating 16kHz PCM audio stream...",
          tag: "QUANTUM SYNC",
        };
      case "listening":
        return {
          headline: "ALL EARS, BABE",
          subtext: "Speak naturally · I'm right here",
          tag: "STREAM ACTIVE",
        };
      case "speaking":
        return {
          headline: "JARVIS TRANSMITTING",
          subtext: "Tap anywhere on core to interrupt",
          tag: "AUDIO 24kHz",
        };
    }
  };

  const status = getStatusText();

  const handleCoreClick = () => {
    if (state === "speaking") {
      onManualInterrupt();
    } else {
      onTogglePower();
    }
  };

  return (
    <div className="relative flex flex-col items-center justify-center w-full max-w-sm sm:max-w-md mx-auto aspect-square select-none">
      {/* Background Orbital Rings & Tech Glyphs */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {/* Outer Tech Ring with Rotation */}
        <div
          className={`absolute w-[92%] h-[92%] rounded-full border border-dashed border-white/10 transition-transform duration-1000 ${
            isConnected ? "animate-spin-slow" : "opacity-40"
          }`}
          style={{ borderColor: isConnected ? `${primaryColor}30` : undefined }}
        />

        {/* Counter-Rotating Inner Dial Ring */}
        <div
          className={`absolute w-[78%] h-[78%] rounded-full border border-white/5 transition-transform duration-1000 ${
            isConnected ? "animate-spin-reverse" : "opacity-30"
          }`}
          style={{ borderColor: isConnected ? `${secondaryColor}25` : undefined }}
        >
          {/* Degree markers */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 w-1 h-2 bg-white/30 rounded-full" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1 w-1 h-2 bg-white/30 rounded-full" />
          <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-2 h-1 bg-white/30 rounded-full" />
          <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1 w-2 h-1 bg-white/30 rounded-full" />
        </div>

        {/* Glowing HUD Aura Radial */}
        <div
          className="absolute w-[65%] h-[65%] rounded-full transition-all duration-700 blur-2xl opacity-40 pointer-events-none"
          style={{
            background: isConnected
              ? `radial-gradient(circle, ${primaryColor}66 0%, ${secondaryColor}22 70%, transparent 100%)`
              : "radial-gradient(circle, rgba(148, 163, 184, 0.15) 0%, transparent 70%)",
          }}
        />
      </div>

      {/* Real-time HTML5 Canvas Visualizer */}
      <AudioVisualizerCanvas
        state={state}
        getFrequencyData={getFrequencyData}
        inputVolume={inputVolume}
        primaryColor={primaryColor}
        secondaryColor={secondaryColor}
      />

      {/* Center Interactive Core / Button */}
      <div className="relative z-20 flex flex-col items-center justify-center">
        <button
          onClick={handleCoreClick}
          aria-label={isConnected ? "Interrupt or Power" : "Awaken Jarvis"}
          className={`relative group flex items-center justify-center w-28 h-28 sm:w-32 sm:h-32 rounded-full backdrop-blur-2xl transition-all duration-300 transform active:scale-95 shadow-2xl ${
            state === "disconnected"
              ? "bg-slate-900/80 border-2 border-slate-700/60 hover:border-slate-500 text-slate-400 hover:text-white"
              : state === "connecting"
              ? "bg-cyan-950/80 border-2 border-cyan-400/80 text-cyan-300 animate-pulse"
              : state === "listening"
              ? "bg-slate-950/90 border-2 text-white"
              : "bg-slate-950/90 border-2 text-white"
          }`}
          style={{
            borderColor: isConnected ? primaryColor : undefined,
            boxShadow: isConnected
              ? `0 0 35px ${primaryColor}55, inset 0 0 20px ${secondaryColor}33`
              : undefined,
          }}
        >
          {/* Inner ring ripple */}
          {isConnected && (
            <div
              className="absolute inset-0 rounded-full animate-ping opacity-25 pointer-events-none"
              style={{ backgroundColor: primaryColor }}
            />
          )}

          {/* Central Icon */}
          <div className="relative z-10 flex flex-col items-center justify-center">
            {state === "disconnected" && (
              <>
                <Power className="w-10 h-10 transition-transform group-hover:scale-110 mb-1" />
                <span className="text-[10px] font-mono-code font-bold tracking-widest text-slate-400">
                  START
                </span>
              </>
            )}

            {state === "connecting" && (
              <>
                <Radio className="w-10 h-10 animate-spin text-cyan-400 mb-1" />
                <span className="text-[10px] font-mono-code font-bold tracking-widest text-cyan-400">
                  LINKING
                </span>
              </>
            )}

            {state === "listening" && (
              <>
                <Mic
                  className="w-11 h-11 transition-transform group-hover:scale-110"
                  style={{ color: primaryColor }}
                />
                <span className="text-[9px] font-mono-code font-bold tracking-widest mt-0.5 text-slate-300">
                  LISTENING
                </span>
              </>
            )}

            {state === "speaking" && (
              <>
                <Sparkles
                  className="w-10 h-10 animate-pulse"
                  style={{ color: secondaryColor }}
                />
                <span className="text-[9px] font-mono-code font-bold tracking-widest mt-0.5 text-white/90">
                  TAP TO CUT
                </span>
              </>
            )}
          </div>
        </button>

        {/* Status Callout Pill below Core */}
        <div className="mt-8 flex flex-col items-center text-center px-4">
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor:
                  state === "disconnected"
                    ? "#64748b"
                    : state === "connecting"
                    ? "#06b6d4"
                    : state === "listening"
                    ? primaryColor
                    : secondaryColor,
              }}
            />
            <span className="text-xs font-mono-code font-bold tracking-wider text-slate-400 uppercase">
              {status.tag}
            </span>
          </div>

          <h2 className="text-lg sm:text-xl font-bold font-tech tracking-wider text-white">
            {status.headline}
          </h2>
          <p className="text-xs text-slate-400 max-w-[260px] truncate mt-0.5">
            {status.subtext}
          </p>
        </div>
      </div>
    </div>
  );
};
