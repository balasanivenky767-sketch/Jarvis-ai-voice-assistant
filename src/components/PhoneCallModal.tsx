import React, { useState, useEffect } from "react";
import {
  X,
  Phone,
  PhoneCall,
  PhoneForwarded,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Radio,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { CallLifecycleState } from "../server/twilioService";
import { apiFetch } from "../config/api";

interface PhoneCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  accentColor: string;
  activeCallSession: any | null;
}

export const PhoneCallModal: React.FC<PhoneCallModalProps> = ({
  isOpen,
  onClose,
  accentColor,
  activeCallSession,
}) => {
  const [reason, setReason] = useState<string>("Urgent system notification requires your decision");
  const [priority, setPriority] = useState<"urgent" | "high" | "normal">("urgent");
  const [customPhone, setCustomPhone] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [triggerResult, setTriggerResult] = useState<any | null>(null);
  const [configStatus, setConfigStatus] = useState<any | null>(null);
  const [recentCalls, setRecentCalls] = useState<any[]>([]);

  // Credentials form state
  const [showConfigForm, setShowConfigForm] = useState<boolean>(false);
  const [accountSidInput, setAccountSidInput] = useState<string>("");
  const [authTokenInput, setAuthTokenInput] = useState<string>("");
  const [fromNumberInput, setFromNumberInput] = useState<string>("");
  const [userNumberInput, setUserNumberInput] = useState<string>("");
  const [isSavingConfig, setIsSavingConfig] = useState<boolean>(false);
  const [configSaveMsg, setConfigSaveMsg] = useState<string | null>(null);

  const fetchConfigAndCalls = async () => {
    try {
      const res = await apiFetch("/api/twilio/calls");
      const data = await res.json();
      setConfigStatus(data.config);
      setRecentCalls(data.calls || []);
      if (!data.config?.isConfigured) {
        setShowConfigForm(true);
      }
      if (data.config?.fromNumber && !fromNumberInput) {
        setFromNumberInput(data.config.fromNumber);
      }
      if (data.config?.defaultUserNumber && !userNumberInput) {
        setUserNumberInput(data.config.defaultUserNumber);
      }
    } catch (err) {
      console.warn("Failed to fetch Twilio config status:", err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchConfigAndCalls();
    }
  }, [isOpen]);

  const handleSaveCredentials = async () => {
    setIsSavingConfig(true);
    setConfigSaveMsg(null);
    try {
      const res = await apiFetch("/api/twilio/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountSid: accountSidInput || undefined,
          authToken: authTokenInput || undefined,
          fromNumber: fromNumberInput || undefined,
          userNumber: userNumberInput || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setConfigStatus(data.config);
        setConfigSaveMsg(data.isConfigured ? "Credentials verified and saved!" : "Saved partially. Please provide all required fields.");
        if (data.isConfigured) {
          setShowConfigForm(false);
        }
      }
    } catch (err: any) {
      setConfigSaveMsg("Failed to save credentials: " + (err?.message || "network error"));
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleTriggerCall = async () => {
    setIsLoading(true);
    setTriggerResult(null);

    try {
      const res = await apiFetch("/api/twilio/trigger-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason,
          priority,
          toPhoneNumber: customPhone || undefined,
        }),
      });

      const data = await res.json();
      setTriggerResult(data);
      fetchConfigAndCalls();
    } catch (err: any) {
      setTriggerResult({
        success: false,
        error: err?.message || "Failed to trigger call via backend",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const currentDisplaySession = activeCallSession || (recentCalls.length > 0 ? recentCalls[0] : null);

  const getStepStatus = (step: string) => {
    const currentState = (activeCallSession?.state || currentDisplaySession?.state || "REQUESTED") as CallLifecycleState;
    const order: CallLifecycleState[] = [
      "REQUESTED",
      "INITIATING",
      "RINGING",
      "ANSWERED",
      "CONNECTED",
      "LIVE",
      "COMPLETED",
    ];

    const currentIdx = order.indexOf(currentState);
    const stepIdx = order.indexOf(step as CallLifecycleState);

    if (currentState === "FAILED" || currentState === "BUSY" || currentState === "NO_ANSWER" || currentState === "REJECTED") {
      return step === currentState ? "error" : "pending";
    }

    if (currentIdx >= stepIdx && currentIdx !== -1) return "completed";
    return "pending";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-3xl bg-slate-950 border border-white/10 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <PhoneCall className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-bold font-tech uppercase tracking-wider text-white">
                Twilio Real Phone Pipeline
              </h3>
              <p className="text-xs text-slate-400 font-mono-code">
                Real Outbound Voice Call · Twilio Media Stream
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-5 space-y-6">
          {/* Telephony Architecture Banner */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-cyan-950/30 to-slate-950 border border-emerald-500/20">
            <div className="flex items-center gap-2 text-emerald-400 mb-1">
              <ShieldAlert className="w-4 h-4" />
              <span className="text-xs font-mono-code font-bold uppercase tracking-wider">
                Real Telecom Infrastructure
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Connects directly to your real mobile phone via the Twilio Voice API.
              When answered, the Twilio 8kHz stream bridges to the <strong>existing Jarvis Brain & Voice</strong> at 16kHz/24kHz for a full two-way voice conversation.
            </p>
          </div>

          {/* Configuration Status Card */}
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono-code uppercase text-slate-400 font-semibold">
                Twilio Account Status
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowConfigForm((prev) => !prev)}
                  className="text-xs text-emerald-400 hover:text-emerald-300 font-mono-code font-bold underline"
                >
                  {showConfigForm ? "Close Setup" : configStatus?.isConfigured ? "Edit Credentials" : "Enter Credentials"}
                </button>
                <button
                  onClick={fetchConfigAndCalls}
                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1 font-mono-code"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-white/5 flex items-center justify-between">
                <span className="text-slate-400">Account SID:</span>
                {configStatus?.hasAccountSid ? (
                  <span className="text-emerald-400 font-bold flex items-center gap-1 font-mono-code text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5" /> OK
                  </span>
                ) : (
                  <span className="text-amber-400 font-bold flex items-center gap-1 font-mono-code text-[11px]">
                    <AlertTriangle className="w-3.5 h-3.5" /> Missing
                  </span>
                )}
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-white/5 flex items-center justify-between">
                <span className="text-slate-400">Auth Token:</span>
                {configStatus?.hasAuthToken ? (
                  <span className="text-emerald-400 font-bold flex items-center gap-1 font-mono-code text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5" /> OK
                  </span>
                ) : (
                  <span className="text-amber-400 font-bold flex items-center gap-1 font-mono-code text-[11px]">
                    <AlertTriangle className="w-3.5 h-3.5" /> Missing
                  </span>
                )}
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-white/5 flex items-center justify-between">
                <span className="text-slate-400">Twilio Caller:</span>
                <span className="font-mono-code text-[11px] text-slate-200 truncate">
                  {configStatus?.fromNumber || "Not Set"}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-white/5 flex items-center justify-between">
                <span className="text-slate-400">Default Dest:</span>
                <span className="font-mono-code text-[11px] text-slate-200 truncate">
                  {configStatus?.defaultUserNumber || "Not Set"}
                </span>
              </div>
            </div>

            {/* In-App Server-Side Credentials Setup Form */}
            {showConfigForm && (
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-emerald-500/30 space-y-3 mt-2 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono-code uppercase font-bold text-emerald-300">
                    Twilio Server Credentials Setup
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono-code">Server-Side Protected</span>
                </div>

                <div className="space-y-2 text-xs">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-0.5 font-mono-code">
                      TWILIO_ACCOUNT_SID
                    </label>
                    <input
                      type="text"
                      value={accountSidInput}
                      onChange={(e) => setAccountSidInput(e.target.value)}
                      placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-white/10 text-white font-mono-code text-xs focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-0.5 font-mono-code">
                      TWILIO_AUTH_TOKEN
                    </label>
                    <input
                      type="password"
                      value={authTokenInput}
                      onChange={(e) => setAuthTokenInput(e.target.value)}
                      placeholder="Your Twilio Auth Token"
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-white/10 text-white font-mono-code text-xs focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-0.5 font-mono-code">
                        TWILIO_PHONE_NUMBER
                      </label>
                      <input
                        type="text"
                        value={fromNumberInput}
                        onChange={(e) => setFromNumberInput(e.target.value)}
                        placeholder="+14155552671"
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-white/10 text-white font-mono-code text-xs focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] text-slate-400 block mb-0.5 font-mono-code">
                        YOUR_MOBILE_NUMBER
                      </label>
                      <input
                        type="text"
                        value={userNumberInput}
                        onChange={(e) => setUserNumberInput(e.target.value)}
                        placeholder="+14155559876"
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-white/10 text-white font-mono-code text-xs focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleSaveCredentials}
                    disabled={isSavingConfig}
                    className="w-full py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-bold text-xs transition font-mono-code mt-1"
                  >
                    {isSavingConfig ? "Saving..." : "Save Credentials Server-Side"}
                  </button>

                  {configSaveMsg && (
                    <p className="text-[11px] text-emerald-300 font-mono-code text-center pt-1">
                      {configSaveMsg}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Trigger Outbound Call Form */}
          <div className="space-y-3">
            <label className="text-xs font-mono-code uppercase text-slate-400 block font-semibold">
              Trigger Real Phone Call to User
            </label>

            <div>
              <span className="text-[11px] text-slate-400 block mb-1">Reason for Call:</span>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Server alarm triggered, urgent decision required"
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-white text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[11px] text-slate-400 block mb-1">Priority:</span>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-white text-xs focus:outline-none"
                >
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="normal">Normal</option>
                </select>
              </div>

              <div>
                <span className="text-[11px] text-slate-400 block mb-1">To Phone (Optional Override):</span>
                <input
                  type="text"
                  value={customPhone}
                  onChange={(e) => setCustomPhone(e.target.value)}
                  placeholder="+14155552671"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-white text-xs font-mono-code focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <button
              onClick={() => {
                if (!configStatus?.isConfigured) {
                  setShowConfigForm(true);
                  return;
                }
                handleTriggerCall();
              }}
              disabled={isLoading}
              className={`w-full py-2.5 rounded-xl font-bold text-xs transition flex items-center justify-center gap-2 shadow-lg ${
                configStatus?.isConfigured
                  ? "bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-500/20"
                  : "bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40"
              }`}
            >
              {isLoading ? (
                <>
                  <Radio className="w-4 h-4 animate-spin" />
                  Initiating via Twilio Voice API...
                </>
              ) : !configStatus?.isConfigured ? (
                <>
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  Enter Twilio Credentials Above to Enable Calling
                </>
              ) : (
                <>
                  <PhoneForwarded className="w-4 h-4" />
                  Call My Mobile Phone Now
                </>
              )}
            </button>
          </div>

          {/* Trigger Result Notification */}
          {triggerResult && (
            <div
              className={`p-3.5 rounded-2xl text-xs border ${
                triggerResult.success
                  ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-200"
                  : "bg-rose-950/40 border-rose-500/30 text-rose-200"
              }`}
            >
              <div className="flex items-center justify-between mb-1 font-bold">
                <span>{triggerResult.success ? "Outbound Call Dispatched" : "Call Dispatch Failed"}</span>
                {triggerResult.callSid && (
                  <span className="font-mono-code text-[10px] text-slate-400">
                    SID: {triggerResult.callSid.slice(0, 10)}...
                  </span>
                )}
              </div>
              <p className="text-[11px] leading-relaxed">
                {triggerResult.success
                  ? `Phone call requested to ${triggerResult.to}. Twilio is dialing your phone right now. Answer the call to begin speaking with Jarvis!`
                  : triggerResult.error}
              </p>
            </div>
          )}

          {/* Real-time Call Lifecycle Telemetry */}
          {currentDisplaySession && (
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono-code uppercase text-slate-400 font-semibold">
                  Twilio Call Lifecycle
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono-code bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30 uppercase">
                  {currentDisplaySession.state}
                </span>
              </div>

              {/* Progress Steps */}
              <div className="grid grid-cols-4 gap-1 text-center">
                {[
                  { id: "INITIATING", label: "Dialing" },
                  { id: "RINGING", label: "Ringing" },
                  { id: "ANSWERED", label: "Answered" },
                  { id: "LIVE", label: "Live Voice" },
                ].map((s) => {
                  const status = getStepStatus(s.id);
                  return (
                    <div
                      key={s.id}
                      className={`p-2 rounded-xl text-[10px] font-mono-code border transition ${
                        status === "completed"
                          ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300 font-bold"
                          : "bg-slate-950/40 border-white/5 text-slate-500"
                      }`}
                    >
                      {s.label}
                    </div>
                  );
                })}
              </div>

              <div className="text-[11px] text-slate-400 space-y-1 font-mono-code pt-1">
                <div>Reason: "{currentDisplaySession.reason}"</div>
                <div>To: {currentDisplaySession.to}</div>
                {currentDisplaySession.callSid && (
                  <div>Twilio SID: {currentDisplaySession.callSid}</div>
                )}
              </div>
            </div>
          )}

          {/* Voice Prompt Tip */}
          <div className="p-3 rounded-2xl bg-slate-900/40 border border-white/5 text-xs text-slate-400 flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-slate-200 font-semibold">Voice Trigger Supported:</span>
              <p className="text-[11px] text-slate-400 mt-0.5">
                You can also simply say to Jarvis: <em className="text-rose-300">"Jarvis, call my phone right now, it's urgent!"</em> and she will autonomously execute this pipeline.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
