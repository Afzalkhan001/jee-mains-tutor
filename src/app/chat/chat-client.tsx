"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { sha256Hex } from "@/lib/crypto/sha256";
import { getStoredJson, setStoredJson } from "@/lib/storage/local";

type Mode = "Beginner" | "Revision" | "Advanced (200+)";

type ChatMsg =
  | { id: string; role: "user"; text: string; imageDataUrl?: string; createdAt: number }
  | { id: string; role: "assistant"; text: string; createdAt: number; meta?: { cached?: boolean } };

type TutorResponse = { output: string; cached: boolean; cacheKey: string };

type QuizItem = {
  id: string;
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  question: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  explanationBullets?: string[];
  commonMistakes?: string[];
  fastTip?: string;
};

type QuizDoc = {
  schemaVersion: 1;
  quizTitle: string;
  items: QuizItem[];
};

async function fileToDataUrl(file: File): Promise<string> {
  // Avoid stack overflow from String.fromCharCode(...hugeArray)
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });

  // If the image is large, downscale/compress to reduce tokens + payload size.
  // Target: max 1280px on the longer side, JPEG quality 0.75.
  if (!rawDataUrl.startsWith("data:image/")) return rawDataUrl;
  if (file.size <= 900_000) return rawDataUrl; // ~0.9MB: keep as-is

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Invalid image"));
      el.src = rawDataUrl;
    });

    const maxDim = 1280;
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const scale = Math.min(1, maxDim / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    if (!ctx) return rawDataUrl;
    ctx.drawImage(img, 0, 0, tw, th);

    return canvas.toDataURL("image/jpeg", 0.75);
  } catch {
    return rawDataUrl;
  }
}

function nowId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

// Icons
const SendIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const ImageIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
  </svg>
);

const SparkleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0L14.59 8.41L23 11L14.59 13.59L12 22L9.41 13.59L1 11L9.41 8.41L12 0Z" />
  </svg>
);

export function ChatClient() {
  const [mode, setMode] = useState<Mode>("Revision");
  const [text, setText] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Bump version to invalidate old cached conversations / old "hi" replies.
  const storageKey = "chat:v2";

  useEffect(() => {
    const saved = getStoredJson<ChatMsg[]>(storageKey);
    if (saved?.length) setMessages(saved);
    else {
      setMessages([
        {
          id: nowId("a"),
          role: "assistant",
          createdAt: Date.now(),
          text:
            "- Definition:\n- Formula:\n- Explanation:\n- Common mistakes:\n- NTA trap alert:\n- PYQ hint:\n- Ask me any JEE MAINS doubt (Math/Physics/Chemistry). You can also upload a screenshot.\n- For a quiz, type: /quiz topic=Vectors n=5 difficulty=mixed",
        },
      ]);
    }
  }, []);

  useEffect(() => {
    setStoredJson(storageKey, messages);
  }, [messages]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const help = useMemo(
    () => ({
      quizExample: "/quiz topic=Vectors n=5 difficulty=mixed",
    }),
    []
  );

  async function handleQuizCommand(cmd: string) {
    // /quiz topic=Vectors n=5 difficulty=mixed
    const parts = cmd.replace("/quiz", "").trim().split(/\s+/).filter(Boolean);
    const kv: Record<string, string> = {};
    for (const p of parts) {
      const [k, ...rest] = p.split("=");
      if (!k || rest.length === 0) continue;
      kv[k.trim()] = rest.join("=").trim();
    }
    const topic = kv.topic || kv.t || "";
    const nQuestions = kv.n ? Number(kv.n) : 5;
    const difficulty = kv.difficulty || kv.d || "mixed";
    if (!topic) throw new Error("Quiz command needs topic=. Example: " + help.quizExample);

    const cacheInput = JSON.stringify({ v: 1, topic, nQuestions, difficulty });
    const localKey = `quiz_cache:${await sha256Hex(cacheInput)}`;
    const cached = getStoredJson<QuizDoc>(localKey);
    if (cached) return { quiz: cached, fromCache: true, localKey };

    const res = await fetch("/api/quiz", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topic, nQuestions, difficulty }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Quiz failed");
    setStoredJson(localKey, data.quiz, { ttlMs: 1000 * 60 * 60 * 24 * 14 });
    return { quiz: data.quiz, fromCache: false, localKey };
  }

  async function send() {
    setErr("");
    const trimmed = text.trim();
    if (!trimmed && !imageFile) return;
    if (loading) return;

    const userId = nowId("u");
    const createdAt = Date.now();

    let imageDataUrl: string | undefined;
    if (imageFile) imageDataUrl = await fileToDataUrl(imageFile);

    const userMsg: ChatMsg = {
      id: userId,
      role: "user",
      text: trimmed || "(image)",
      imageDataUrl,
      createdAt,
    };
    setMessages((m) => [...m, userMsg]);
    setText("");
    setImageFile(null);
    setLoading(true);

    try {
      if (trimmed.startsWith("/quiz")) {
        const { quiz, fromCache } = await handleQuizCommand(trimmed);
        const qd = quiz as QuizDoc;
        const lines: string[] = [];
        lines.push("- Definition:");
        lines.push("- Formula:");
        lines.push("- Explanation:");
        lines.push(`- Quiz: ${qd.quizTitle || "Quiz"}`);
        (qd.items || []).forEach((q: QuizItem, idx: number) => {
          lines.push(`- Q${idx + 1}: ${q.question}`);
          q.options?.forEach((op: string, oi: number) => lines.push(`- (${oi}) ${op}`));
          lines.push(`- Answer: (${q.correctIndex})`);
          if (q.fastTip) lines.push(`- Fast tip: ${q.fastTip}`);
        });
        setMessages((m) => [
          ...m,
          { id: nowId("a"), role: "assistant", createdAt: Date.now(), text: lines.join("\n"), meta: { cached: fromCache } },
        ]);
        return;
      }

      // Default: Tutor chat (any topic)
      // Bump version to invalidate old cached tutor responses (e.g., old "hi" output).
      const cacheInput = JSON.stringify({
        v: 2,
        mode,
        text: trimmed,
        imageHash: imageDataUrl ? await sha256Hex(imageDataUrl) : "",
      });
      const localKey = `chat_tutor_cache:${await sha256Hex(cacheInput)}`;
      const cached = getStoredJson<TutorResponse>(localKey);
      if (cached?.output) {
        setMessages((m) => [
          ...m,
          { id: nowId("a"), role: "assistant", createdAt: Date.now(), text: cached.output, meta: { cached: true } },
        ]);
        return;
      }

      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode,
          question: trimmed || undefined,
          imageDataUrl: imageDataUrl || undefined,
        }),
      });
      const data = (await res.json()) as TutorResponse | { error: string };
      if (!res.ok) throw new Error("error" in data ? data.error : "Tutor failed");
      if (!("output" in data)) throw new Error("Bad tutor response");

      setStoredJson(localKey, data, { ttlMs: 1000 * 60 * 60 * 24 * 30 });
      setMessages((m) => [...m, { id: nowId("a"), role: "assistant", createdAt: Date.now(), text: data.output, meta: { cached: data.cached } }]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  function clearChat() {
    setMessages([]);
    setStoredJson(storageKey, []);
  }

  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex h-[calc(100vh-120px)] flex-col animate-fade-in">
      {/* Header */}
      <header className="shrink-0 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm card-hover">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 text-white">
              <SparkleIcon />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight gradient-text">JEE Tutor AI</h1>
              <div className="text-xs text-zinc-500">Bullet-only · Formula-first · Any topic</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-900 focus-ring transition-all hover:border-zinc-300"
              value={mode}
              onChange={(e) => setMode(e.target.value as Mode)}
            >
              <option>Beginner</option>
              <option>Revision</option>
              <option>Advanced (200+)</option>
            </select>
            <button
              className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium transition-all hover:bg-zinc-50 hover:border-zinc-300"
              onClick={clearChat}
            >
              Clear
            </button>
          </div>
        </div>
      </header>

      {/* Messages */}
      <section className="mt-4 flex-1 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div ref={listRef} className="h-full overflow-auto p-4 smooth-scroll">
          <div className="grid gap-3 stagger-children">
            {messages.map((m) => (
              <div
                key={m.id}
                className={[
                  "animate-slide-up rounded-2xl border p-4 text-sm leading-relaxed shadow-sm",
                  m.role === "user"
                    ? "ml-auto max-w-[88%] border-blue-100 bg-gradient-to-br from-blue-50 to-blue-100/50"
                    : "mr-auto max-w-[88%] border-zinc-100 bg-white",
                ].join(" ")}
              >
                {m.role === "assistant" && (
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-purple-600">
                    <SparkleIcon /> AI Tutor
                  </div>
                )}
                <div className="whitespace-pre-wrap text-zinc-900">{m.text}</div>
                {"imageDataUrl" in m && m.imageDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt="uploaded question"
                    src={m.imageDataUrl}
                    className="mt-3 max-h-48 w-auto rounded-xl border border-zinc-200 shadow-sm"
                  />
                ) : null}
                {"meta" in m && m.meta?.cached ? (
                  <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                    ⚡ Instant
                  </div>
                ) : null}
              </div>
            ))}
            {loading && (
              <div className="mr-auto max-w-[88%] animate-pulse-soft rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-sm text-zinc-600">
                  <div className="typing-dots">
                    <span></span><span></span><span></span>
                  </div>
                  Thinking...
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Input Area */}
      <div className="mt-4 shrink-0 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
        {err && (
          <div className="mb-3 animate-bounce-in rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {err}
          </div>
        )}
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              rows={2}
              placeholder={`Ask any JEE doubt... or try ${help.quizExample}`}
              className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none transition-all focus:border-blue-300 focus:bg-white focus:shadow-sm"
            />
            {imageFile && (
              <div className="mt-2 flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-1.5 text-xs text-blue-700">
                <ImageIcon /> {imageFile.name}
                <button onClick={() => setImageFile(null)} className="ml-auto text-blue-500 hover:text-blue-700">×</button>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-500 transition-all hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-700 btn-interactive"
              title="Attach image"
            >
              <ImageIcon />
            </button>
            <button
              onClick={send}
              disabled={loading}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-md transition-all hover:shadow-lg disabled:opacity-50 btn-interactive"
            >
              <SendIcon />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

