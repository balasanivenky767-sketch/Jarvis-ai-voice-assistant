import React, { useState, useRef, useEffect } from "react";
import {
  X,
  Send,
  Paperclip,
  Sparkles,
  Brain,
  Code,
  FileCode,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  Play,
  Copy,
  Check,
  RefreshCw,
  Terminal,
  Layers,
  Search,
  Sliders,
  Maximize2,
  Minimize2,
  Trash2,
  FileText,
  Volume2,
  HelpCircle,
  Cpu,
} from "lucide-react";
import { WorkspaceAttachment } from "../server/workspaceService";

interface PromptItem {
  id: string;
  role: "user" | "model";
  text: string;
  attachments?: WorkspaceAttachment[];
  timestamp: string;
  status?: "thinking" | "planning" | "executing" | "generating" | "completed" | "error";
  plan?: string[];
  tools?: Array<{ name: string; args: any; output?: any; callId?: string }>;
  metadata?: {
    latencyMs?: number;
    model?: string;
    requestId?: string;
  };
  error?: string;
}

interface AIWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  accentColor: string;
}

const STARTER_PROMPTS = [
  { label: "Build", text: "Create a modern TypeScript React dashboard component with charts and status cards." },
  { label: "Debug", text: "Inspect src/App.tsx and analyze the real-time event pipeline for edge cases." },
  { label: "Explain", text: "Explain the architecture of Jarvis voice, Twilio phone calls, Telegram, and WhatsApp pipelines." },
  { label: "Analyze", text: "Analyze the current project codebase structure and list all active capabilities." },
  { label: "Search", text: "Search web for latest advancements in AI agent orchestration frameworks." },
  { label: "Tool", text: "Send a Telegram message saying 'All systems operational'." },
];

export const AIWorkspaceModal: React.FC<AIWorkspaceModalProps> = ({
  isOpen,
  onClose,
  accentColor,
}) => {
  const [prompt, setPrompt] = useState<string>("");
  const [items, setItems] = useState<PromptItem[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [selectedModel, setSelectedModel] = useState<string>("gemini-3.8-flash");
  const [highThinking, setHighThinking] = useState<boolean>(true);
  const [temperature, setTemperature] = useState<number>(0.7);
  const [attachments, setAttachments] = useState<WorkspaceAttachment[]>([]);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [conversationId] = useState<string>(() => `ws_${Date.now()}`);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [isOpen, items]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const isText =
        file.type.startsWith("text/") ||
        file.name.endsWith(".ts") ||
        file.name.endsWith(".tsx") ||
        file.name.endsWith(".js") ||
        file.name.endsWith(".jsx") ||
        file.name.endsWith(".json") ||
        file.name.endsWith(".py") ||
        file.name.endsWith(".md") ||
        file.name.endsWith(".css") ||
        file.name.endsWith(".html");

      const reader = new FileReader();

      if (isText) {
        reader.onload = () => {
          setAttachments((prev) => [
            ...prev,
            {
              name: file.name,
              type: file.type || "text/plain",
              size: file.size,
              data: reader.result as string,
              isText: true,
            },
          ]);
        };
        reader.readAsText(file);
      } else {
        reader.onload = () => {
          setAttachments((prev) => [
            ...prev,
            {
              name: file.name,
              type: file.type || "application/octet-stream",
              size: file.size,
              data: reader.result as string,
              isText: false,
            },
          ]);
        };
        reader.readAsDataURL(file);
      }
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRunPrompt = async (textOverride?: string) => {
    const promptText = (textOverride || prompt).trim();
    if (!promptText && attachments.length === 0) return;
    if (isRunning) return;

    const userMessageId = `msg_user_${Date.now()}`;
    const modelMessageId = `msg_model_${Date.now()}`;

    // Add user message to UI
    const newItems: PromptItem[] = [
      ...items,
      {
        id: userMessageId,
        role: "user",
        text: promptText,
        attachments: [...attachments],
        timestamp: new Date().toLocaleTimeString(),
      },
      {
        id: modelMessageId,
        role: "model",
        text: "",
        timestamp: new Date().toLocaleTimeString(),
        status: "thinking",
        plan: [],
        tools: [],
      },
    ];

    setItems(newItems);
    setPrompt("");
    const sentAttachments = [...attachments];
    setAttachments([]);
    setIsRunning(true);

    try {
      const response = await fetch("/api/jarvis/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptText,
          conversationId,
          attachments: sentAttachments,
          model: selectedModel,
          highThinking,
          temperature,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let currentEvent = "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            currentEvent = line.replace("event:", "").trim();
          } else if (line.startsWith("data:")) {
            const rawData = line.replace("data:", "").trim();
            if (!rawData) continue;

            try {
              const data = JSON.parse(rawData);

              setItems((prev) =>
                prev.map((item) => {
                  if (item.id !== modelMessageId) return item;

                  switch (currentEvent) {
                    case "request_started":
                      return { ...item, status: "thinking" };

                    case "thinking":
                      return { ...item, status: "thinking" };

                    case "planning":
                      return { ...item, status: "planning", plan: data.plan };

                    case "tool_started": {
                      const tools = item.tools || [];
                      return {
                        ...item,
                        status: "executing",
                        tools: [...tools, { name: data.name, args: data.args, callId: data.callId }],
                      };
                    }

                    case "tool_result": {
                      const tools = (item.tools || []).map((t) =>
                        t.callId === data.callId || t.name === data.name
                          ? { ...t, output: data.output }
                          : t
                      );
                      return { ...item, status: "generating", tools };
                    }

                    case "response_delta":
                      return {
                        ...item,
                        status: "generating",
                        text: item.text + data.delta,
                      };

                    case "completed":
                      return {
                        ...item,
                        status: "completed",
                        text: data.fullText || item.text,
                        metadata: data.metadata,
                      };

                    case "error":
                      return {
                        ...item,
                        status: "error",
                        error: data.error,
                      };

                    default:
                      return item;
                  }
                })
              );
            } catch (_) {}
          }
        }
      }
    } catch (err: any) {
      setItems((prev) =>
        prev.map((item) =>
          item.id === modelMessageId
            ? { ...item, status: "error", error: err?.message || "Execution failed" }
            : item
        )
      );
    } finally {
      setIsRunning(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  const handleClearSession = async () => {
    try {
      await fetch("/api/jarvis/workspace/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
      setItems([]);
    } catch (_) {}
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
      <div
        className={`relative w-full rounded-3xl bg-slate-950 border border-white/10 shadow-2xl flex flex-col transition-all duration-300 ${
          isFullScreen ? "h-full max-w-full" : "h-[92vh] max-w-5xl"
        }`}
      >
        {/* Workspace Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-900/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-violet-500/20 text-violet-400 border border-violet-500/30 shadow-lg shadow-violet-500/10">
              <Cpu className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold font-tech uppercase tracking-wider text-white">
                  Jarvis AI Studio Workspace
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono-code font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  PROMPT PIPELINE
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono-code">
                Unified Multimodal Brain · Autonomous Execution · Real Tool Calling
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Model Selector */}
            <div className="hidden sm:flex items-center bg-slate-900 border border-white/10 rounded-xl p-1 text-xs font-mono-code">
              <button
                onClick={() => setSelectedModel("gemini-3.8-flash")}
                className={`px-2.5 py-1 rounded-lg transition ${
                  selectedModel === "gemini-3.8-flash"
                    ? "bg-violet-500/30 text-violet-200 font-bold border border-violet-500/40"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Flash 3.8
              </button>
              <button
                onClick={() => setSelectedModel("gemini-3.1-pro-preview")}
                className={`px-2.5 py-1 rounded-lg transition ${
                  selectedModel === "gemini-3.1-pro-preview"
                    ? "bg-violet-500/30 text-violet-200 font-bold border border-violet-500/40"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Pro 3.1
              </button>
            </div>

            {/* High Thinking Toggle */}
            <button
              onClick={() => setHighThinking((prev) => !prev)}
              title="Toggle High Thinking Reasoning Level"
              className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono-code transition ${
                highThinking
                  ? "border-violet-500/50 bg-violet-950/40 text-violet-300 font-bold"
                  : "border-white/10 bg-slate-900/50 text-slate-400"
              }`}
            >
              <Brain className="w-3.5 h-3.5" />
              Thinking: {highThinking ? "HIGH" : "OFF"}
            </button>

            {/* Parameters Settings Drawer */}
            <button
              onClick={() => setShowSettings((prev) => !prev)}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition border border-white/10"
              title="Workspace settings"
            >
              <Sliders className="w-4 h-4" />
            </button>

            {/* Clear Session */}
            <button
              onClick={handleClearSession}
              className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition border border-white/10"
              title="Clear workspace conversation"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {/* Fullscreen Toggle */}
            <button
              onClick={() => setIsFullScreen((prev) => !prev)}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition border border-white/10"
            >
              {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition border border-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Optional Settings Panel Drawer */}
        {showSettings && (
          <div className="px-6 py-3 border-b border-white/10 bg-slate-900/60 flex flex-wrap items-center gap-6 text-xs font-mono-code animate-in slide-in-from-top-2 duration-150 shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-slate-400">Temperature:</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-28 accent-violet-500 cursor-pointer"
              />
              <span className="text-white font-bold">{temperature.toFixed(2)}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400">Active Model:</span>
              <span className="text-violet-300 font-bold">{selectedModel}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400">Memory ID:</span>
              <span className="text-slate-300">{conversationId}</span>
            </div>
          </div>
        )}

        {/* Conversation Canvas */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto py-8">
              <div className="p-4 rounded-3xl bg-violet-500/10 border border-violet-500/20 text-violet-400 mb-4 shadow-xl shadow-violet-500/10">
                <Sparkles className="w-8 h-8 animate-pulse" />
              </div>
              <h4 className="text-lg font-bold font-tech uppercase tracking-wider text-white mb-2">
                What shall we engineer, chief?
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed font-mono-code mb-6">
                Enter your prompt below. Jarvis will understand your intent, plan the task, execute real tools, inspect codebase files, analyze multimodal attachments, and stream the complete result.
              </p>

              {/* Starter Quick Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full text-left">
                {STARTER_PROMPTS.map((starter, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleRunPrompt(starter.text)}
                    className="p-3 rounded-2xl bg-slate-900/60 border border-white/10 hover:border-violet-500/40 hover:bg-slate-900 transition group text-xs text-slate-300 flex items-start gap-2"
                  >
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-violet-500/20 text-violet-300 font-mono-code font-bold uppercase shrink-0">
                      {starter.label}
                    </span>
                    <span className="line-clamp-2 text-slate-300 group-hover:text-white">
                      {starter.text}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            items.map((item) => {
              const isUser = item.role === "user";

              if (isUser) {
                return (
                  <div key={item.id} className="flex flex-col items-end space-y-2">
                    <div className="max-w-2xl rounded-3xl bg-slate-900 border border-white/15 p-4 text-xs text-white shadow-lg space-y-2">
                      {/* Attachments preview */}
                      {item.attachments && item.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 pb-2 border-b border-white/10">
                          {item.attachments.map((att, attIdx) => (
                            <div
                              key={attIdx}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-950 border border-white/10 text-[11px] font-mono-code text-slate-300"
                            >
                              {att.type.startsWith("image/") ? (
                                <ImageIcon className="w-3.5 h-3.5 text-sky-400" />
                              ) : att.type.startsWith("audio/") ? (
                                <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                              ) : (
                                <FileCode className="w-3.5 h-3.5 text-violet-400" />
                              )}
                              <span className="truncate max-w-[140px]">{att.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="leading-relaxed whitespace-pre-wrap font-sans text-[13px]">{item.text}</p>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono-code px-2">
                      {item.timestamp}
                    </span>
                  </div>
                );
              }

              // Model Response Card
              return (
                <div key={item.id} className="flex flex-col space-y-3">
                  <div className="w-full rounded-3xl bg-slate-900/60 border border-white/10 p-5 text-xs text-slate-200 shadow-xl space-y-4">
                    {/* Execution Status / Pipeline progress banner */}
                    {item.status && item.status !== "completed" && (
                      <div className="p-3 rounded-2xl bg-slate-950/80 border border-violet-500/30 flex items-center justify-between animate-in fade-in">
                        <div className="flex items-center gap-2.5">
                          <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-violet-500"></span>
                          </span>
                          <span className="text-xs font-mono-code uppercase font-bold text-violet-300 tracking-wider">
                            {item.status === "thinking"
                              ? "ANALYZING INTENT..."
                              : item.status === "planning"
                              ? "BUILDING TASK PLAN..."
                              : item.status === "executing"
                              ? "EXECUTING TOOLS & CAPABILITIES..."
                              : "STREAMING RESPONSE..."}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono-code text-slate-400">
                          {selectedModel}
                        </span>
                      </div>
                    )}

                    {/* Step Plan Checklist */}
                    {item.plan && item.plan.length > 0 && (
                      <div className="p-3 rounded-2xl bg-slate-950/60 border border-white/5 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[11px] font-mono-code font-bold uppercase text-slate-400">
                          <Layers className="w-3.5 h-3.5 text-violet-400" />
                          <span>Execution Plan</span>
                        </div>
                        <div className="space-y-1 pl-4">
                          {item.plan.map((step, sIdx) => (
                            <div
                              key={sIdx}
                              className="text-[11px] font-mono-code text-slate-300 flex items-center gap-2"
                            >
                              <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                              <span>{step}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Real Tool Execution Logs */}
                    {item.tools && item.tools.length > 0 && (
                      <div className="space-y-2">
                        {item.tools.map((tool, tIdx) => (
                          <div
                            key={tIdx}
                            className="p-3 rounded-2xl bg-slate-950 border border-emerald-500/20 space-y-1.5"
                          >
                            <div className="flex items-center justify-between text-[11px] font-mono-code">
                              <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                                <Terminal className="w-3.5 h-3.5" />
                                Tool Call: {tool.name}()
                              </span>
                              <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-500/20 text-emerald-300">
                                {tool.output ? "EXECUTED" : "RUNNING"}
                              </span>
                            </div>

                            {tool.args && (
                              <pre className="text-[10px] font-mono-code text-slate-400 bg-slate-900/60 p-2 rounded-xl overflow-x-auto">
                                {JSON.stringify(tool.args, null, 2)}
                              </pre>
                            )}

                            {tool.output && (
                              <div className="pt-1 text-[11px] text-slate-300 font-mono-code">
                                <span className="text-[10px] text-slate-500 block">Result:</span>
                                <pre className="text-[10px] font-mono-code text-emerald-300/90 bg-emerald-950/20 p-2 rounded-xl overflow-x-auto max-h-36">
                                  {typeof tool.output === "string"
                                    ? tool.output
                                    : JSON.stringify(tool.output, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Formatted Generated Response Text */}
                    {item.text && (
                      <div className="prose prose-invert max-w-none text-[13px] leading-relaxed space-y-3 font-sans text-slate-200">
                        {item.text.split("```").map((chunk, cIdx) => {
                          if (cIdx % 2 === 1) {
                            // Code block
                            const lines = chunk.split("\n");
                            const lang = lines[0].trim() || "typescript";
                            const codeContent = lines.slice(1).join("\n");
                            const blockId = `code_${item.id}_${cIdx}`;

                            return (
                              <div
                                key={cIdx}
                                className="my-3 rounded-2xl bg-slate-950 border border-white/10 overflow-hidden font-mono-code text-xs"
                              >
                                <div className="flex items-center justify-between px-4 py-2 bg-slate-900/90 border-b border-white/10 text-[11px] text-slate-400">
                                  <span>{lang}</span>
                                  <button
                                    onClick={() => copyToClipboard(codeContent, blockId)}
                                    className="flex items-center gap-1 text-slate-300 hover:text-white transition"
                                  >
                                    {copiedCodeId === blockId ? (
                                      <>
                                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                                        <span className="text-emerald-400">Copied</span>
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-3.5 h-3.5" />
                                        <span>Copy Code</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                                <pre className="p-4 overflow-x-auto text-slate-200 leading-normal">
                                  <code>{codeContent}</code>
                                </pre>
                              </div>
                            );
                          }

                          // Standard text formatting
                          return (
                            <p key={cIdx} className="whitespace-pre-wrap leading-relaxed">
                              {chunk}
                            </p>
                          );
                        })}
                      </div>
                    )}

                    {/* Error Notice */}
                    {item.error && (
                      <div className="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-200 text-xs flex items-start gap-2.5">
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold">Prompt Execution Encountered Issue</p>
                          <p className="text-[11px] text-rose-300">{item.error}</p>
                        </div>
                      </div>
                    )}

                    {/* Response Metadata Footer */}
                    {item.metadata && (
                      <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[10px] font-mono-code text-slate-500">
                        <div className="flex items-center gap-3">
                          <span>Latency: {item.metadata.latencyMs}ms</span>
                          <span>Model: {item.metadata.model}</span>
                        </div>
                        <span>Status: Verified</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Prompt Input Footer Bar */}
        <div className="p-4 border-t border-white/10 bg-slate-900/60 shrink-0 space-y-3">
          {/* Attachments Carousel */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-1">
              {attachments.map((att, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-slate-900 border border-white/10 text-xs font-mono-code text-white animate-in zoom-in-90"
                >
                  {att.type.startsWith("image/") ? (
                    <ImageIcon className="w-3.5 h-3.5 text-sky-400" />
                  ) : att.type.startsWith("audio/") ? (
                    <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                  ) : (
                    <FileCode className="w-3.5 h-3.5 text-violet-400" />
                  )}
                  <span className="truncate max-w-[160px]">{att.name}</span>
                  <span className="text-[10px] text-slate-400">
                    ({Math.round(att.size / 1024)} KB)
                  </span>
                  <button
                    onClick={() => removeAttachment(idx)}
                    className="p-0.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Input Control Box */}
          <div className="relative rounded-2xl bg-slate-950 border border-white/15 focus-within:border-violet-500/50 focus-within:ring-1 focus-within:ring-violet-500/30 transition shadow-inner">
            <textarea
              ref={textareaRef}
              rows={2}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleRunPrompt();
                }
              }}
              placeholder="Enter your instruction or prompt... (e.g. 'Build a React dashboard', 'Explain this code in App.tsx', 'Analyze this image')"
              className="w-full bg-transparent px-4 pt-3 pb-12 text-xs text-white placeholder-slate-500 focus:outline-none resize-none font-sans"
            />

            {/* Bottom Actions Row */}
            <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  multiple
                  className="hidden"
                  accept="image/*,audio/*,.ts,.tsx,.js,.jsx,.json,.py,.md,.txt,.css,.html"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-white/10 text-slate-300 hover:text-white hover:border-white/20 text-xs font-mono-code transition"
                  title="Attach image, code file, document, or audio"
                >
                  <Paperclip className="w-3.5 h-3.5 text-violet-400" />
                  <span>+ Attach</span>
                </button>

                <span className="hidden sm:inline text-[11px] text-slate-500 font-mono-code">
                  Shift+Enter for newline
                </span>
              </div>

              <button
                onClick={() => handleRunPrompt()}
                disabled={isRunning || (!prompt.trim() && attachments.length === 0)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-bold text-xs font-mono-code transition shadow-lg shadow-violet-600/30"
              >
                {isRunning ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Executing...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>RUN PROMPT</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
