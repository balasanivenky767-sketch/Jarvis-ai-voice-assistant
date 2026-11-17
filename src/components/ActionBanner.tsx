import React, { useEffect, useState } from "react";
import { ExternalLink, Search, Clock, Brain, Sparkles, X, PhoneCall, MessageSquare, Send } from "lucide-react";
import { ToolAction } from "../services/liveSession";

interface ActionBannerProps {
  action: ToolAction | null;
  onDismiss: () => void;
  accentColor: string;
}

export const ActionBanner: React.FC<ActionBannerProps> = ({ action, onDismiss, accentColor }) => {
  const [countdown, setCountdown] = useState<number>(3);

  useEffect(() => {
    if (!action) return;

    // For openWebsite, if auto-open is desired
    if (action.name === "openWebsite" && action.args?.url) {
      try {
        window.open(action.args.url, "_blank");
      } catch (_) {
        // Popups might be blocked by iframe
      }
    }

    setCountdown(3);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [action]);

  if (!action) return null;

  const renderContent = () => {
    switch (action.name) {
      case "openWebsite":
        return (
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <ExternalLink className="w-5 h-5 animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono-code uppercase tracking-wider text-cyan-400 font-bold">
                  External Nav Protocol
                </span>
                <span className="text-[10px] text-slate-400">· Tool Executed</span>
              </div>
              <h4 className="text-sm font-semibold text-white truncate">
                {action.args?.name || "Target Webpage"}
              </h4>
              <p className="text-xs text-slate-400 truncate font-mono-code">{action.args?.url}</p>
            </div>
            {action.args?.url && (
              <a
                href={action.args.url}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-bold transition flex items-center gap-1 shadow-lg shadow-cyan-500/25"
              >
                Launch
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        );

      case "searchWebOrMedia":
        return (
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-violet-500/20 text-violet-400 border border-violet-500/30">
              <Search className="w-5 h-5 animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-mono-code uppercase tracking-wider text-violet-400 font-bold">
                Live Query Dispatch
              </span>
              <h4 className="text-sm font-semibold text-white truncate">
                "{action.args?.query}"
              </h4>
              <p className="text-xs text-slate-400">Platform: {action.args?.platform || "Google"}</p>
            </div>
          </div>
        );

      case "setTimer":
        return (
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Clock className="w-5 h-5 animate-bounce" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-mono-code uppercase tracking-wider text-amber-400 font-bold">
                Temporal Countdown Engaged
              </span>
              <h4 className="text-sm font-semibold text-white">
                {action.args?.seconds}s ({action.args?.label || "Timer"})
              </h4>
              <p className="text-xs text-slate-400">Jarvis will notify you upon expiration</p>
            </div>
          </div>
        );

      case "consultDeepThinkingEngine":
        return (
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse">
              <Brain className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono-code uppercase tracking-wider text-rose-400 font-bold">
                  Gemini 3.1 Pro Preview
                </span>
                <span className="px-1.5 py-0.5 rounded text-[9px] bg-rose-500/30 text-rose-300 font-mono-code">
                  ThinkingLevel.HIGH
                </span>
              </div>
              <h4 className="text-sm font-semibold text-white truncate">
                {action.args?.complexQuery || "Analyzing Complex Dilemma"}
              </h4>
              <p className="text-xs text-slate-400">Deep cognitive deliberation in progress...</p>
            </div>
          </div>
        );

      case "changeAuraTheme":
        return (
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Sparkles className="w-5 h-5 animate-spin" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-mono-code uppercase tracking-wider text-emerald-400 font-bold">
                HUD Hologram Morph
              </span>
              <h4 className="text-sm font-semibold text-white capitalize">
                Aura shifted to {action.args?.theme}
              </h4>
            </div>
          </div>
        );

      case "triggerPhoneCall":
        return (
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse">
              <PhoneCall className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono-code uppercase tracking-wider text-emerald-400 font-bold">
                  Twilio Phone Call Triggered
                </span>
                <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/30 text-emerald-300 font-mono-code">
                  {action.args?.state || "INITIATING"}
                </span>
              </div>
              <h4 className="text-sm font-semibold text-white truncate">
                Calling: {action.args?.to || "User Mobile"}
              </h4>
              <p className="text-xs text-slate-300 truncate">
                Reason: "{action.args?.reason || "Urgent attention required"}"
              </p>
            </div>
          </div>
        );

      case "sendTelegramMessage":
        return (
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30">
              <Send className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono-code uppercase tracking-wider text-sky-400 font-bold">
                  Telegram Dispatched
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-mono-code font-bold ${
                    action.args?.success
                      ? "bg-emerald-500/30 text-emerald-300"
                      : "bg-rose-500/30 text-rose-300"
                  }`}
                >
                  {action.args?.success ? "SENT" : "FAILED"}
                </span>
              </div>
              <h4 className="text-sm font-semibold text-white truncate">
                Chat: {action.args?.chatId || "Default Chat"}
              </h4>
              <p className="text-xs text-slate-300 truncate">
                "{action.args?.message}"
              </p>
              {!action.args?.success && (
                <a
                  href="https://t.me/Tech_76740358_bot?start=connect"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-[11px] font-mono-code text-sky-400 hover:underline"
                >
                  <span>Open @Tech_76740358_bot & tap /start</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        );

      case "sendWhatsAppMessage":
        return (
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono-code uppercase tracking-wider text-emerald-400 font-bold">
                  WhatsApp Dispatched
                </span>
                <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/30 text-emerald-300 font-mono-code">
                  {action.args?.success ? "SENT" : "FAILED"}
                </span>
              </div>
              <h4 className="text-sm font-semibold text-white truncate">
                To: {action.args?.recipient}
              </h4>
              <p className="text-xs text-slate-300 truncate">
                "{action.args?.message}"
              </p>
            </div>
          </div>
        );

      default:
        return (
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-slate-800 text-slate-200">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-mono-code uppercase tracking-wider text-slate-400">
                Action Executed
              </span>
              <h4 className="text-sm font-semibold text-white">{action.name}</h4>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="w-full max-w-md mx-auto px-4 z-40 animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="relative overflow-hidden rounded-2xl bg-slate-900/90 backdrop-blur-xl border border-white/10 p-3.5 shadow-2xl shadow-black/80">
        <div
          className="absolute top-0 left-0 right-0 h-0.5"
          style={{ backgroundColor: accentColor }}
        />
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">{renderContent()}</div>
          <button
            onClick={onDismiss}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
