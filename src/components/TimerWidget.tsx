import React, { useEffect, useState } from "react";
import { Clock, CheckCircle2, X } from "lucide-react";

interface TimerWidgetProps {
  initialSeconds: number;
  label?: string;
  onComplete: () => void;
  onDismiss: () => void;
}

export const TimerWidget: React.FC<TimerWidgetProps> = ({
  initialSeconds,
  label = "Timer",
  onComplete,
  onDismiss,
}) => {
  const [remaining, setRemaining] = useState<number>(initialSeconds);
  const [isFinished, setIsFinished] = useState<boolean>(false);

  useEffect(() => {
    setRemaining(initialSeconds);
    setIsFinished(false);

    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setIsFinished(true);
          onComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [initialSeconds, onComplete]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const progressPercent = Math.max(0, Math.min(100, (1 - remaining / initialSeconds) * 100));

  return (
    <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-slate-900/80 backdrop-blur-md border border-amber-500/30 text-amber-300 shadow-xl shadow-amber-950/40 animate-in fade-in zoom-in-95 duration-200">
      {isFinished ? (
        <CheckCircle2 className="w-5 h-5 text-emerald-400 animate-bounce" />
      ) : (
        <Clock className="w-5 h-5 text-amber-400 animate-spin-slow" />
      )}

      <div className="flex flex-col">
        <span className="text-[10px] font-mono-code uppercase tracking-wider text-amber-400/80">
          {label} {isFinished ? "• COMPLETE!" : ""}
        </span>
        <span className="text-base font-bold font-mono-code text-white">
          {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
        </span>
      </div>

      <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden ml-1">
        <div
          className={`h-full transition-all duration-1000 ${
            isFinished ? "bg-emerald-400" : "bg-amber-400"
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <button
        onClick={onDismiss}
        className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition ml-1"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
