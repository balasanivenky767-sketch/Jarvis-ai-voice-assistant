import React, { useState, useEffect } from "react";
import {
  X,
  Send,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Globe,
  Radio,
  Lock,
  Trash2,
  ExternalLink,
  Bot,
  Smartphone,
  ArrowDownLeft,
  ArrowUpRight,
} from "lucide-react";
import { JarvisMessageEvent, MessagingConfigStatus } from "../server/messagingService";
import { apiFetch } from "../config/api";

interface MessagingModalProps {
  isOpen: boolean;
  onClose: () => void;
  accentColor: string;
  liveEvents: JarvisMessageEvent[];
}

export const MessagingModal: React.FC<MessagingModalProps> = ({
  isOpen,
  onClose,
  accentColor,
  liveEvents,
}) => {
  const [activeTab, setActiveTab] = useState<"telegram" | "whatsapp" | "feed">("telegram");
  const [status, setStatus] = useState<MessagingConfigStatus | null>(null);
  const [events, setEvents] = useState<JarvisMessageEvent[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Telegram test form
  const [tgChatId, setTgChatId] = useState<string>("");
  const [tgMessage, setTgMessage] = useState<string>("Hello from Jarvis via Telegram Bot!");
  const [isSendingTg, setIsSendingTg] = useState<boolean>(false);

  // WhatsApp test form
  const [waRecipient, setWaRecipient] = useState<string>("");
  const [waMessage, setWaMessage] = useState<string>("Hello from Jarvis via WhatsApp Cloud API!");
  const [isSendingWa, setIsSendingWa] = useState<boolean>(false);

  // Credentials config inputs
  const [showConfig, setShowConfig] = useState<boolean>(false);
  const [tgTokenInput, setTgTokenInput] = useState<string>("");
  const [tgAllowedUsersInput, setTgAllowedUsersInput] = useState<string>("*");
  const [tgDefaultChatInput, setTgDefaultChatInput] = useState<string>("");
  const [waTokenInput, setWaTokenInput] = useState<string>("");
  const [waPhoneIdInput, setWaPhoneIdInput] = useState<string>("");
  const [waVerifyTokenInput, setWaVerifyTokenInput] = useState<string>("jarvis_meta_verify_token");
  const [waAllowedNumbersInput, setWaAllowedNumbersInput] = useState<string>("*");
  const [isSavingConfig, setIsSavingConfig] = useState<boolean>(false);
  const [isSyncingChats, setIsSyncingChats] = useState<boolean>(false);

  const fetchStatusAndEvents = async () => {
    setIsLoading(true);
    try {
      const [resStatus, resEvents] = await Promise.all([
        apiFetch("/api/messaging/status"),
        apiFetch("/api/messaging/events"),
      ]);
      const dataStatus = await resStatus.json();
      const dataEvents = await resEvents.json();
      setStatus(dataStatus);
      setEvents(dataEvents.events || []);

      if (dataStatus.telegram?.allowedUsers && tgAllowedUsersInput === "*") {
        setTgAllowedUsersInput(dataStatus.telegram.allowedUsers);
      }
      if (dataStatus.telegram?.defaultChatId) {
        setTgDefaultChatInput(dataStatus.telegram.defaultChatId);
        if (!tgChatId) setTgChatId(dataStatus.telegram.defaultChatId);
      } else if (dataStatus.telegram?.knownChats?.length > 0 && !tgChatId) {
        setTgChatId(dataStatus.telegram.knownChats[0].id);
      }

      if (dataStatus.whatsapp?.allowedNumbers && waAllowedNumbersInput === "*") {
        setWaAllowedNumbersInput(dataStatus.whatsapp.allowedNumbers);
      }
      if (dataStatus.whatsapp?.phoneNumberId && !waPhoneIdInput) {
        setWaPhoneIdInput(dataStatus.whatsapp.phoneNumberId);
      }
    } catch (err: any) {
      console.warn("Failed to fetch messaging status:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncTelegramChats = async () => {
    setIsSyncingChats(true);
    try {
      const res = await apiFetch("/api/telegram/sync-chats");
      const data = await res.json();
      if (data.chats && data.chats.length > 0) {
        setActionNotice(`Found ${data.chats.length} active Telegram chat(s)!`);
        if (!tgChatId) setTgChatId(data.chats[0].id);
        fetchStatusAndEvents();
      } else {
        setActionNotice("No recent chats found. Open your Telegram bot and click /start first.");
      }
    } catch (_) {
      setActionNotice("Could not sync chats. Ensure bot token is set.");
    } finally {
      setIsSyncingChats(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatusAndEvents();
    }
  }, [isOpen]);

  // Sync incoming real-time live events from WebSocket
  useEffect(() => {
    if (liveEvents.length > 0) {
      setEvents((prev) => {
        const merged = [...liveEvents, ...prev];
        const seen = new Set();
        return merged.filter((item) => {
          if (seen.has(item.eventId)) return false;
          seen.add(item.eventId);
          return true;
        }).slice(0, 50);
      });
    }
  }, [liveEvents]);

  const handleSaveCredentials = async () => {
    setIsSavingConfig(true);
    setActionNotice(null);
    try {
      const res = await apiFetch("/api/messaging/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegramBotToken: tgTokenInput || undefined,
          telegramAllowedUsers: tgAllowedUsersInput || undefined,
          telegramDefaultChatId: tgDefaultChatInput || undefined,
          whatsAppAccessToken: waTokenInput || undefined,
          whatsAppPhoneNumberId: waPhoneIdInput || undefined,
          whatsAppVerifyToken: waVerifyTokenInput || undefined,
          whatsAppAllowedNumbers: waAllowedNumbersInput || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setActionNotice("Credentials saved server-side!");
        fetchStatusAndEvents();
        setShowConfig(false);
      }
    } catch (err: any) {
      setActionNotice("Save failed: " + (err?.message || "error"));
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleSetTelegramWebhook = async () => {
    setActionNotice(null);
    try {
      const res = await apiFetch("/api/telegram/set-webhook", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setActionNotice("Telegram webhook successfully registered with Telegram Bot API!");
        fetchStatusAndEvents();
      } else {
        setActionNotice("Telegram webhook notice: " + (data.result?.description || data.error));
      }
    } catch (err: any) {
      setActionNotice("Failed to set webhook: " + err?.message);
    }
  };

  const handleSendTelegram = async () => {
    if (!tgChatId || !tgMessage) {
      setActionNotice("Please specify Chat ID and Message for Telegram");
      return;
    }
    setIsSendingTg(true);
    setActionNotice(null);
    try {
      const res = await apiFetch("/api/telegram/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: tgChatId, message: tgMessage }),
      });
      const data = await res.json();
      if (data.success) {
        setActionNotice("Telegram message sent successfully!");
        setTgMessage("");
        fetchStatusAndEvents();
      } else {
        setActionNotice("Telegram send failed: " + (data.error || "error"));
      }
    } catch (err: any) {
      setActionNotice("Failed to send: " + err?.message);
    } finally {
      setIsSendingTg(false);
    }
  };

  const handleSendWhatsApp = async () => {
    if (!waRecipient || !waMessage) {
      setActionNotice("Please specify Recipient Number and Message for WhatsApp");
      return;
    }
    setIsSendingWa(true);
    setActionNotice(null);
    try {
      const res = await apiFetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: waRecipient, message: waMessage }),
      });
      const data = await res.json();
      if (data.success) {
        setActionNotice("WhatsApp message sent successfully via Meta Cloud API!");
        setWaMessage("");
        fetchStatusAndEvents();
      } else {
        setActionNotice("WhatsApp send failed: " + (data.error || "error"));
      }
    } catch (err: any) {
      setActionNotice("Failed to send: " + err?.message);
    } finally {
      setIsSendingWa(false);
    }
  };

  const handleClearHistory = async () => {
    try {
      await apiFetch("/api/messaging/clear-history", { method: "POST" });
      setEvents([]);
      setActionNotice("Conversation memory and event log cleared.");
    } catch (err) {}
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl rounded-3xl bg-slate-950 border border-white/10 p-6 shadow-2xl max-h-[90vh] overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-sky-500/20 text-sky-400 border border-sky-500/30">
              <MessageSquare className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-bold font-tech uppercase tracking-wider text-white">
                Telegram + WhatsApp Pipeline
              </h3>
              <p className="text-xs text-slate-400 font-mono-code">
                Bi-Directional Messaging · Unified Jarvis Memory & Brain
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

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 mt-4 pb-3 border-b border-white/5">
          <button
            onClick={() => setActiveTab("telegram")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-mono-code font-bold transition ${
              activeTab === "telegram"
                ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            Telegram
            {status?.telegram?.isConfigured && (
              <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
            )}
          </button>

          <button
            onClick={() => setActiveTab("whatsapp")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-mono-code font-bold transition ${
              activeTab === "whatsapp"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            WhatsApp
            {status?.whatsapp?.isConfigured && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>

          <button
            onClick={() => setActiveTab("feed")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-mono-code font-bold transition ${
              activeTab === "feed"
                ? "bg-violet-500/20 text-violet-300 border border-violet-500/40"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            Live Feed
            <span className="px-1.5 py-0.2 rounded text-[10px] bg-white/10 text-slate-300">
              {events.length}
            </span>
          </button>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowConfig((prev) => !prev)}
              className="text-xs font-mono-code text-slate-400 hover:text-white underline"
            >
              {showConfig ? "Hide Config" : "API Credentials"}
            </button>
            <button
              onClick={fetchStatusAndEvents}
              disabled={isLoading}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
              title="Refresh status"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Global Notice Banner */}
        {actionNotice && (
          <div className="mt-3 p-3 rounded-xl bg-slate-900 border border-white/10 text-xs font-mono-code text-slate-200 flex items-center justify-between">
            <span>{actionNotice}</span>
            <button onClick={() => setActionNotice(null)} className="text-slate-400 hover:text-white">
              ✕
            </button>
          </div>
        )}

        {/* Credentials Configuration Drawer */}
        {showConfig && (
          <div className="mt-3 p-4 rounded-2xl bg-slate-900/90 border border-sky-500/30 space-y-3 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono-code uppercase font-bold text-sky-300 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" />
                Server-Side Messaging Credentials
              </span>
              <span className="text-[10px] text-slate-400 font-mono-code">Protected in Environment</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {/* Telegram Form */}
              <div className="space-y-2 p-3 rounded-xl bg-slate-950/60 border border-white/5">
                <span className="text-[11px] font-mono-code font-bold text-sky-400 block">
                  Telegram Bot Settings
                </span>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-0.5 font-mono-code">
                    TELEGRAM_BOT_TOKEN
                  </label>
                  <input
                    type="password"
                    value={tgTokenInput}
                    onChange={(e) => setTgTokenInput(e.target.value)}
                    placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-white/10 text-white font-mono-code text-xs focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-0.5 font-mono-code">
                    TELEGRAM_ALLOWED_USERS (IDs or @usernames, comma-separated, or *)
                  </label>
                  <input
                    type="text"
                    value={tgAllowedUsersInput}
                    onChange={(e) => setTgAllowedUsersInput(e.target.value)}
                    placeholder="e.g. 123456789, @username, or *"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-white/10 text-white font-mono-code text-xs focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-0.5 font-mono-code">
                    TELEGRAM_DEFAULT_CHAT_ID (Optional - primary chat for voice & autonomous notifications)
                  </label>
                  <input
                    type="text"
                    value={tgDefaultChatInput}
                    onChange={(e) => setTgDefaultChatInput(e.target.value)}
                    placeholder="e.g. 123456789"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-white/10 text-white font-mono-code text-xs focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              {/* WhatsApp Form */}
              <div className="space-y-2 p-3 rounded-xl bg-slate-950/60 border border-white/5">
                <span className="text-[11px] font-mono-code font-bold text-emerald-400 block">
                  WhatsApp Cloud API Settings
                </span>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-0.5 font-mono-code">
                    WHATSAPP_ACCESS_TOKEN (Meta System User Token)
                  </label>
                  <input
                    type="password"
                    value={waTokenInput}
                    onChange={(e) => setWaTokenInput(e.target.value)}
                    placeholder="EAAxxxxxxxxxxxxxxxx..."
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-white/10 text-white font-mono-code text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-0.5 font-mono-code">
                    WHATSAPP_PHONE_NUMBER_ID
                  </label>
                  <input
                    type="text"
                    value={waPhoneIdInput}
                    onChange={(e) => setWaPhoneIdInput(e.target.value)}
                    placeholder="e.g. 123456789012345"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-white/10 text-white font-mono-code text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-0.5 font-mono-code">
                    WHATSAPP_VERIFY_TOKEN
                  </label>
                  <input
                    type="text"
                    value={waVerifyTokenInput}
                    onChange={(e) => setWaVerifyTokenInput(e.target.value)}
                    placeholder="e.g. jarvis_meta_verify_token"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-white/10 text-white font-mono-code text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-0.5 font-mono-code">
                    WHATSAPP_ALLOWED_NUMBERS (comma-separated, or *)
                  </label>
                  <input
                    type="text"
                    value={waAllowedNumbersInput}
                    onChange={(e) => setWaAllowedNumbersInput(e.target.value)}
                    placeholder="e.g. +917842860753, or *"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-white/10 text-white font-mono-code text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={handleSaveCredentials}
              disabled={isSavingConfig}
              className="w-full py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-black font-bold text-xs font-mono-code transition"
            >
              {isSavingConfig ? "Saving..." : "Save Credentials Server-Side"}
            </button>
          </div>
        )}

        {/* Tab 1: Telegram */}
        {activeTab === "telegram" && (
          <div className="mt-4 space-y-4">
            {/* Direct Bot Activation Card */}
            {status?.telegram?.botUsername && (
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-sky-950/60 to-slate-900/80 border border-sky-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-sky-300 font-mono-code uppercase">
                      1-Step Bot Activation
                    </span>
                    <span className="px-1.5 py-0.2 text-[9px] bg-sky-500/20 text-sky-300 rounded font-mono-code">
                      Required by Telegram
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Open <strong>@{status.telegram.botUsername}</strong> in Telegram and press <strong>/start</strong> so Telegram links your chat with the bot.
                  </p>
                </div>
                <a
                  href={`https://t.me/${status.telegram.botUsername}?start=connect`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-black font-bold text-xs font-mono-code shrink-0 flex items-center gap-1.5 transition shadow-lg shadow-sky-500/20"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open @{status.telegram.botUsername}
                </a>
              </div>
            )}

            {/* Status Card */}
            <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-white/5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono-code uppercase text-slate-400 font-semibold">
                  Telegram Bot API Status
                </span>
                {status?.telegram?.isConfigured ? (
                  <span className="text-sky-400 font-bold flex items-center gap-1 font-mono-code text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Bot Connected
                  </span>
                ) : (
                  <span className="text-amber-400 font-bold flex items-center gap-1 font-mono-code text-[11px]">
                    <AlertTriangle className="w-3.5 h-3.5" /> Token Missing
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-white/5">
                  <span className="text-[10px] text-slate-400 block">Bot Account:</span>
                  <span className="font-mono-code text-slate-200 text-xs">
                    {status?.telegram?.botUsername ? `@${status.telegram.botUsername}` : "Not Connected"}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-white/5">
                  <span className="text-[10px] text-slate-400 block">Allowed Senders:</span>
                  <span className="font-mono-code text-slate-200 text-xs truncate block">
                    {status?.telegram?.allowedUsers || "*"}
                  </span>
                </div>
              </div>

              {/* Webhook Info & Registration */}
              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-white/5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[10px] text-slate-400 block font-mono-code">Webhook Endpoint:</span>
                  <span className="font-mono-code text-[11px] text-sky-300 truncate block">
                    {status?.telegram?.webhookUrl || "/api/telegram/webhook"}
                  </span>
                </div>
                <button
                  onClick={handleSetTelegramWebhook}
                  className="px-2.5 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 text-[11px] font-mono-code font-bold shrink-0 transition"
                >
                  Register Webhook
                </button>
              </div>
            </div>

            {/* Test Send Message Form */}
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono-code uppercase text-slate-400 block font-semibold">
                  Send Telegram Message via JARVIS Brain
                </span>
                <button
                  onClick={handleSyncTelegramChats}
                  disabled={isSyncingChats}
                  className="text-[10px] font-mono-code text-sky-400 hover:text-sky-300 underline flex items-center gap-1"
                >
                  <RefreshCw className={`w-2.5 h-2.5 ${isSyncingChats ? "animate-spin" : ""}`} />
                  Sync / Discover Chats
                </button>
              </div>

              {/* Known / Discovered active chat chips */}
              {status?.telegram?.knownChats && status.telegram.knownChats.length > 0 && (
                <div className="p-2 rounded-xl bg-slate-950/60 border border-white/5 space-y-1">
                  <span className="text-[10px] text-slate-400 font-mono-code block">
                    Active / Discovered Chats:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {status.telegram.knownChats.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setTgChatId(c.id)}
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-mono-code transition ${
                          tgChatId === c.id
                            ? "bg-sky-500/30 text-sky-200 border border-sky-500/50 font-bold"
                            : "bg-slate-900 text-slate-300 hover:bg-slate-800 border border-white/5"
                        }`}
                      >
                        {c.name} ({c.id})
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2 text-xs">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">
                    Destination Chat ID:
                  </label>
                  <input
                    type="text"
                    value={tgChatId}
                    onChange={(e) => setTgChatId(e.target.value)}
                    placeholder="e.g. 123456789 or @username"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-white font-mono-code text-xs focus:outline-none focus:border-sky-500"
                  />
                  <p className="text-[10px] text-slate-500 font-mono-code mt-1">
                    💡 If sending fails with "chat not found", open your bot in Telegram (
                    {status?.telegram?.botUsername ? (
                      <a
                        href={`https://t.me/${status.telegram.botUsername}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sky-400 hover:underline"
                      >
                        @{status.telegram.botUsername}
                      </a>
                    ) : (
                      "your bot"
                    )}
                    ) and press <strong>/start</strong> first.
                  </p>
                </div>

                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">
                    Message Text:
                  </label>
                  <textarea
                    rows={2}
                    value={tgMessage}
                    onChange={(e) => setTgMessage(e.target.value)}
                    placeholder="Type message..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-white text-xs focus:outline-none focus:border-sky-500"
                  />
                </div>

                <button
                  onClick={handleSendTelegram}
                  disabled={isSendingTg}
                  className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-black font-bold text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-sky-500/20"
                >
                  {isSendingTg ? (
                    <>
                      <Radio className="w-4 h-4 animate-spin" />
                      Sending to Telegram...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Send Message
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Flow architecture tip */}
            <div className="p-3 rounded-2xl bg-slate-900/40 border border-white/5 text-xs text-slate-300 space-y-1">
              <p className="font-semibold text-sky-300">How Two-Way Telegram Works:</p>
              <p className="text-[11px] text-slate-400">
                1. Once the webhook is registered, any message sent to your Telegram bot is received in real-time.
                <br />
                2. The Telegram Adapter passes the text to the <strong>EXISTING JARVIS BRAIN</strong>.
                <br />
                3. Jarvis formulates her witty response with full context and sends it back to your Telegram chat.
              </p>
            </div>
          </div>
        )}

        {/* Tab 2: WhatsApp */}
        {activeTab === "whatsapp" && (
          <div className="mt-4 space-y-4">
            {/* Status Card */}
            <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-white/5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono-code uppercase text-slate-400 font-semibold">
                  WhatsApp Cloud API Status
                </span>
                {status?.whatsapp?.isConfigured ? (
                  <span className="text-emerald-400 font-bold flex items-center gap-1 font-mono-code text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5" /> API Connected
                  </span>
                ) : (
                  <span className="text-amber-400 font-bold flex items-center gap-1 font-mono-code text-[11px]">
                    <AlertTriangle className="w-3.5 h-3.5" /> Credentials Missing
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-white/5">
                  <span className="text-[10px] text-slate-400 block">Phone Number ID:</span>
                  <span className="font-mono-code text-slate-200 text-xs truncate block">
                    {status?.whatsapp?.phoneNumberId || "Not Set"}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-white/5">
                  <span className="text-[10px] text-slate-400 block">Allowed Senders:</span>
                  <span className="font-mono-code text-slate-200 text-xs truncate block">
                    {status?.whatsapp?.allowedNumbers || "*"}
                  </span>
                </div>
              </div>

              {/* Meta Webhook Setup Instructions */}
              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-white/5 space-y-1.5 text-xs">
                <span className="text-[10px] text-slate-400 block font-mono-code">
                  Meta App Dashboard Webhook Configuration:
                </span>
                <div className="space-y-1 font-mono-code text-[11px]">
                  <div>
                    <span className="text-slate-400">Callback URL:</span>{" "}
                    <span className="text-emerald-300">{status?.whatsapp?.webhookUrl}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Verify Token:</span>{" "}
                    <span className="text-emerald-300">{waVerifyTokenInput}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Test Send WhatsApp Message Form */}
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/5 space-y-3">
              <span className="text-xs font-mono-code uppercase text-slate-400 block font-semibold">
                Send WhatsApp Message via JARVIS Brain
              </span>

              <div className="space-y-2 text-xs">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">
                    Destination Mobile Number:
                  </label>
                  <input
                    type="text"
                    value={waRecipient}
                    onChange={(e) => setWaRecipient(e.target.value)}
                    placeholder="e.g. +917842860753 or +14155552671"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-white font-mono-code text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">
                    Message Text:
                  </label>
                  <textarea
                    rows={2}
                    value={waMessage}
                    onChange={(e) => setWaMessage(e.target.value)}
                    placeholder="Type message..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-white text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <button
                  onClick={handleSendWhatsApp}
                  disabled={isSendingWa}
                  className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-bold text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
                >
                  {isSendingWa ? (
                    <>
                      <Radio className="w-4 h-4 animate-spin" />
                      Sending to WhatsApp...
                    </>
                  ) : (
                    <>
                      <Smartphone className="w-4 h-4" />
                      Send WhatsApp Message
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Flow architecture tip */}
            <div className="p-3 rounded-2xl bg-slate-900/40 border border-white/5 text-xs text-slate-300 space-y-1">
              <p className="font-semibold text-emerald-300">How Official WhatsApp Webhook Works:</p>
              <p className="text-[11px] text-slate-400">
                1. In your Meta Developers App Dashboard, configure the Callback URL above.
                <br />
                2. When a user sends a message on WhatsApp, Meta calls <code>/api/whatsapp/webhook</code>.
                <br />
                3. The WhatsApp Adapter normalizes the event and passes it to the <strong>EXISTING JARVIS BRAIN</strong>.
                <br />
                4. Jarvis generates a smart response and delivers it back directly to the user's WhatsApp.
              </p>
            </div>
          </div>
        )}

        {/* Tab 3: Unified Live Message Feed */}
        {activeTab === "feed" && (
          <div className="mt-4 space-y-3 flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono-code uppercase text-slate-400 font-semibold">
                Unified Real-Time Event Stream
              </span>
              <button
                onClick={handleClearHistory}
                className="text-[11px] font-mono-code text-rose-400 hover:text-rose-300 flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                Clear Feed & Memory
              </button>
            </div>

            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {events.length === 0 ? (
                <div className="p-6 rounded-2xl bg-slate-900/40 border border-white/5 text-center text-xs text-slate-500 font-mono-code">
                  No messaging events yet. Send a test message or configure your Telegram/WhatsApp bot to see live traffic!
                </div>
              ) : (
                events.map((ev) => {
                  const isIncoming = ev.direction === "incoming";
                  const isTelegram = ev.platform === "telegram";

                  return (
                    <div
                      key={ev.eventId}
                      className={`p-3 rounded-2xl border transition ${
                        isIncoming
                          ? "bg-slate-900/70 border-white/10"
                          : isTelegram
                          ? "bg-sky-950/30 border-sky-500/30"
                          : "bg-emerald-950/30 border-emerald-500/30"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-mono-code font-bold uppercase ${
                              isTelegram
                                ? "bg-sky-500/30 text-sky-300"
                                : "bg-emerald-500/30 text-emerald-300"
                            }`}
                          >
                            {ev.platform}
                          </span>

                          <span
                            className={`flex items-center gap-1 text-[10px] font-mono-code font-semibold ${
                              isIncoming ? "text-amber-400" : "text-slate-300"
                            }`}
                          >
                            {isIncoming ? (
                              <>
                                <ArrowDownLeft className="w-3 h-3" /> INCOMING
                              </>
                            ) : (
                              <>
                                <ArrowUpRight className="w-3 h-3" /> JARVIS OUTGOING
                              </>
                            )}
                          </span>
                        </div>

                        <span className="text-[10px] text-slate-500 font-mono-code">
                          {new Date(ev.timestamp).toLocaleTimeString()}
                        </span>
                      </div>

                      <p className="text-xs text-white leading-relaxed">{ev.text}</p>

                      <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500 font-mono-code">
                        <span>
                          {isIncoming ? `From: ${ev.senderName || ev.senderId}` : `To: ${ev.recipientId}`}
                        </span>
                        {ev.status && (
                          <span
                            className={`uppercase ${
                              ev.status === "failed"
                                ? "text-rose-400"
                                : ev.status === "sent" || ev.status === "received"
                                ? "text-emerald-400"
                                : "text-slate-400"
                            }`}
                          >
                            {ev.status}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
