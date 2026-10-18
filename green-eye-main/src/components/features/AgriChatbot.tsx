import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Bot,
  User,
  Send,
  Mic,
  Square,
  ImagePlus,
  X,
  Trash2,
  Zap,
  Loader2,
  Calendar,
  Bug,
  Droplets,
  FileText,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useChatContext } from "@/hooks/useChatContext";

/**
 * Krishi Sahayak — AI agriculture assistant.
 * Talks to the Flask backend in /chatbot (routes: POST /chat, POST /chat/clear).
 * In dev, Vite proxies VITE_CHATBOT_API_URL (default "/chatbot-api") to the Flask server.
 */
const API_BASE = (import.meta.env.VITE_CHATBOT_API_URL as string | undefined) ?? "/chatbot-api";
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const DEFAULT_IMAGE_PROMPT =
  "What do you see in this image? Please analyze from an agricultural perspective.";

interface ChatMessage {
  id: string;
  role: "user" | "bot";
  text: string;
  time: string;
  imageUrl?: string;
  cacheHitRate?: number;
}

interface ChatResponse {
  text?: string;
  transcription?: string;
  voice?: string;
  error?: string;
  cache?: { cached_tokens: number; hit_rate: number };
}

const SUGGESTIONS = [
  { icon: Calendar, label: "Wheat planting season", text: "What is the best time to plant wheat in India?" },
  { icon: Bug, label: "Tomato pest control", text: "How to control pest attack on tomato plants?" },
  { icon: Droplets, label: "Paddy fertilizer", text: "What fertilizer is good for paddy rice?" },
  { icon: FileText, label: "PM-KISAN scheme", text: "Tell me about PM-KISAN scheme eligibility" },
];

const now = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const uid = () => Math.random().toString(36).slice(2, 11);

// Language names the backend prompt can drop straight into an instruction
// like "Respond in {name}." — keep in sync with src/i18n/config.ts.
const LANGUAGE_NAMES: Record<string, string> = { en: "English", hi: "Hindi", mr: "Marathi" };

async function postChat(body: FormData, timeoutMs: number): Promise<ChatResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      body,
      credentials: "include", // Flask keeps the conversation in a session cookie
      signal: controller.signal,
    });
    const data: ChatResponse = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
    return data;
  } catch (err) {
    if ((err as Error).name === "AbortError") throw new Error("Request timed out. Try again.");
    if (err instanceof TypeError) {
      throw new Error("Cannot reach the chatbot server. Make sure the Flask backend is running.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const AgriChatbot = () => {
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const { buildContext } = useChatContext();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [image, setImage] = useState<{ file: File; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => () => {
    recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  const addMessage = (m: Omit<ChatMessage, "id" | "time">) =>
    setMessages((prev) => [...prev, { ...m, id: uid(), time: now() }]);

  const playVoice = (voice?: string) => {
    if (!voice || !audioRef.current) return;
    audioRef.current.src = `${API_BASE}${voice}`;
    audioRef.current.play().catch(() => {});
  };

  const handleReply = (r: ChatResponse) => {
    if (r.text) {
      addMessage({
        role: "bot",
        text: r.text,
        cacheHitRate: r.cache && r.cache.cached_tokens > 0 ? r.cache.hit_rate : undefined,
      });
      playVoice(r.voice);
    }
  };

  /**
   * Attaches the selected UI language and this farmer's personalized
   * context (location, weather, current plant, latest disease prediction,
   * and — only when the question calls for it — plant history, past
   * treatments, or the whole farm's crop list) to every chat request. See
   * useChatContext.ts for the full selection logic.
   */
  const attachContext = async (fd: FormData, userMessage: string) => {
    fd.append("language", LANGUAGE_NAMES[i18n.resolvedLanguage ?? "en"] ?? "English");

    const context = await buildContext(userMessage);
    if (Object.keys(context).length > 0) {
      fd.append("context", JSON.stringify(context));
    }
  };

  const send = async (override?: string) => {
    if (busy) return;
    let text = (override ?? input).trim();
    if (!text && !image) return;
    if (!text && image) text = DEFAULT_IMAGE_PROMPT;

    const attached = image;
    addMessage({ role: "user", text, imageUrl: attached?.preview });
    setInput("");
    setImage(null);
    if (fileRef.current) fileRef.current.value = "";
    setBusy(true);

    try {
      const fd = new FormData();
      fd.append("text", text);
      if (attached) fd.append("image", attached.file, attached.file.name || "image.jpg");
      await attachContext(fd, text);
      handleReply(await postChat(fd, 60000));
    } catch (err) {
      addMessage({ role: "bot", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const onPickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Please select an image file.", variant: "destructive" });
    } else if (file.size > MAX_IMAGE_BYTES) {
      toast({ title: "Image too large. Max 4MB allowed.", variant: "destructive" });
    } else {
      setImage({ file, preview: URL.createObjectURL(file) });
    }
    e.target.value = "";
  };

  const sendAudio = async (blob: Blob) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("audio", blob, "recording.webm");
      // We don't have the transcribed text yet (that happens server-side),
      // so voice messages always get the cheap always-included context
      // (location/weather/current plant/latest prediction) without the
      // keyword-triggered history/treatment/farm-wide lookups.
      await attachContext(fd, "");
      const r = await postChat(fd, 60000);
      if (r.transcription) addMessage({ role: "user", text: r.transcription });
      handleReply(r);
    } catch (err) {
      addMessage({ role: "bot", text: (err as Error).message || "Could not process audio." });
    } finally {
      setBusy(false);
    }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast({ title: "Voice recording is not supported in this browser.", variant: "destructive" });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        sendAudio(new Blob(chunksRef.current, { type: "audio/webm" }));
      };
      recorder.start(250);
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      toast({ title: "Microphone access denied.", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    setRecording(false);
  };

  const clearChat = async () => {
    if (!messages.length || !window.confirm("Clear this conversation?")) return;
    try {
      await fetch(`${API_BASE}/chat/clear`, { method: "POST", credentials: "include" });
    } catch {
      /* backend unreachable — still clear the local view */
    }
    setMessages([]);
    audioRef.current?.pause();
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-lg">{t("chatbot.title")}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {t("chatbot.subtitle")}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={clearChat} disabled={!messages.length || busy}>
          <Trash2 className="mr-2 h-4 w-4" /> {t("chatbot.newChat")}
        </Button>
      </CardHeader>

      <CardContent className="p-0">
        <div ref={scrollRef} className="h-[420px] space-y-4 overflow-y-auto p-4">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <Bot className="h-10 w-10 text-primary" />
              <p className="max-w-md text-sm text-muted-foreground">
                {t("chatbot.subtitle")}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map(({ icon: Icon, label, text }) => (
                  <Button key={label} variant="outline" size="sm" onClick={() => send(text)} disabled={busy}>
                    <Icon className="mr-2 h-4 w-4" /> {label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                }`}
              >
                {m.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                  m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                }`}
              >
                {m.imageUrl && (
                  <img src={m.imageUrl} alt="Shared" className="mb-2 max-h-48 rounded-lg object-cover" />
                )}
                <p className="whitespace-pre-wrap break-words">{m.text}</p>
                <div className="mt-1 flex items-center gap-2 text-xs opacity-70">
                  <span>{m.time}</span>
                  {m.cacheHitRate !== undefined && (
                    <Badge variant="secondary" className="h-5 gap-1 px-1.5 text-[10px]">
                      <Zap className="h-3 w-3" /> {m.cacheHitRate}% cached
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          ))}

          {busy && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("chatbot.thinking")}
            </div>
          )}
        </div>

        {image && (
          <div className="relative mx-4 mb-2 inline-block">
            <img src={image.preview} alt="Preview" className="h-20 rounded-lg border object-cover" />
            <button
              type="button"
              aria-label="Remove image"
              onClick={() => setImage(null)}
              className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex items-center gap-2 border-t p-3"
        >
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
          <Button type="button" variant="ghost" size="icon" title="Attach image" onClick={() => fileRef.current?.click()} disabled={busy || recording}>
            <ImagePlus className="h-5 w-5" />
          </Button>
          <Button
            type="button"
            variant={recording ? "destructive" : "ghost"}
            size="icon"
            title={recording ? "Stop recording" : "Record voice"}
            onClick={recording ? stopRecording : startRecording}
            disabled={busy}
          >
            {recording ? <Square className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </Button>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={recording ? "Recording... click stop to send" : t("chatbot.placeholder")}
            disabled={busy || recording}
            aria-label="Message"
          />
          <Button type="submit" size="icon" disabled={busy || recording || (!input.trim() && !image)} title="Send">
            <Send className="h-4 w-4" />
          </Button>
        </form>
        <audio ref={audioRef} className="hidden" />
      </CardContent>
    </Card>
  );
};
