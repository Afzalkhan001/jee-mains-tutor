"use client";

import { useMemo, useState } from "react";
import { ChapterDocV1 } from "@/lib/content/types";
import { sha256Hex } from "@/lib/crypto/sha256";
import { getStoredJson, setStoredJson } from "@/lib/storage/local";

type Mode = "Beginner" | "Revision" | "Advanced (200+)";

type TutorResponse = {
  cached: boolean;
  cacheKey: string;
  output: string;
};

async function fileToDataUrl(file: File): Promise<string> {
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });

  if (!rawDataUrl.startsWith("data:image/")) return rawDataUrl;
  if (file.size <= 900_000) return rawDataUrl;

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

export function TutorClient({ chapter }: { chapter: ChapterDocV1 }) {
  const [mode, setMode] = useState<Mode>("Revision");
  const [subtopicId, setSubtopicId] = useState(chapter.subtopics[0]?.id ?? "");
  const [question, setQuestion] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [output, setOutput] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState<{ cached?: boolean; key?: string } | null>(null);
  const [err, setErr] = useState<string>("");

  const subtopic = useMemo(
    () => chapter.subtopics.find((s) => s.id === subtopicId),
    [chapter.subtopics, subtopicId]
  );

  async function runTutor() {
    setErr("");
    setMeta(null);
    setLoading(true);
    try {
      const imageDataUrl = imageFile ? await fileToDataUrl(imageFile) : "";
      const cacheInput = JSON.stringify({
        v: 1,
        subject: chapter.subject,
        chapter: chapter.chapterId,
        subtopic: subtopic?.name ?? subtopicId,
        mode,
        question,
        imageHash: imageDataUrl ? await sha256Hex(imageDataUrl) : "",
      });

      const localKey = `tutor_cache:${await sha256Hex(cacheInput)}`;
      const cached = getStoredJson<TutorResponse>(localKey);
      if (cached?.output) {
        setOutput(cached.output);
        setMeta({ cached: true, key: cached.cacheKey });
        setLoading(false);
        return;
      }

      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject: chapter.subject,
          chapter: chapter.chapterName,
          subtopic: subtopic?.name ?? subtopicId,
          mode,
          question: question.trim() || undefined,
          imageDataUrl: imageDataUrl || undefined,
        }),
      });

      const data = (await res.json()) as TutorResponse | { error: string };
      if (!res.ok) {
        throw new Error("error" in data ? data.error : "Tutor request failed");
      }
      if (!("output" in data)) throw new Error("Bad tutor response");

      setOutput(data.output);
      setMeta({ cached: data.cached, key: data.cacheKey });
      setStoredJson(localKey, data, { ttlMs: 1000 * 60 * 60 * 24 * 30 }); // 30 days
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Tutor failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-4">
      <header className="rounded-xl border border-zinc-200 bg-white p-5">
        <div className="flex flex-col gap-1">
          <div className="text-sm text-zinc-600">Tutor</div>
          <h1 className="text-xl font-semibold tracking-tight">
            {chapter.subject.toUpperCase()} · {chapter.chapterName}
          </h1>
          <div className="text-xs text-zinc-600">
            Bullet-only. Formula-first. Exam-focused. Cached locally.
          </div>
        </div>
      </header>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="grid gap-1">
            <div className="text-xs font-medium text-zinc-700">Tutor mode</div>
            <select
              className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm"
              value={mode}
              onChange={(e) => setMode(e.target.value as Mode)}
            >
              <option>Beginner</option>
              <option>Revision</option>
              <option>Advanced (200+)</option>
            </select>
          </label>

          <label className="grid gap-1 md:col-span-2">
            <div className="text-xs font-medium text-zinc-700">Subtopic</div>
            <select
              className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm"
              value={subtopicId}
              onChange={(e) => setSubtopicId(e.target.value)}
            >
              {chapter.subtopics.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.difficulty} · {s.weightage}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 grid gap-2">
          <div className="text-xs font-medium text-zinc-700">
            Optional: type question OR upload image (question screenshot)
          </div>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={4}
            placeholder="Paste/Type a JEE-style question. Example: If |a|=5, |b|=3 and angle is 60°, find a·b."
            className="w-full rounded-md border border-zinc-300 bg-white p-3 text-sm outline-none focus:border-zinc-500"
          />

          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
              />
            </label>

            <button
              onClick={runTutor}
              disabled={loading}
              className="h-10 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-60"
            >
              {loading ? "Thinking..." : "Get Tutor Explanation"}
            </button>
          </div>

          {err ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {err}
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-semibold">Output</div>
          <div className="text-xs text-zinc-600">
            {meta?.key ? (
              <>
                CacheKey: <span className="font-mono">{meta.key.slice(0, 10)}…</span> ·{" "}
                {meta.cached ? "cached" : "fresh"}
              </>
            ) : (
              "—"
            )}
          </div>
        </div>
        <pre className="mt-3 whitespace-pre-wrap rounded-md bg-zinc-50 p-3 text-sm leading-6 text-zinc-900">
          {output || "- (Ask a question or choose a subtopic and click “Get Tutor Explanation”.)"}
        </pre>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <div className="font-semibold">Formula Vault (chapter snapshot)</div>
        <div className="mt-3 grid gap-2">
          {chapter.formulas.map((f) => (
            <button
              key={f.id}
              className="rounded-md border border-zinc-200 bg-white p-3 text-left hover:bg-zinc-50"
              onClick={() => navigator.clipboard.writeText(f.expression)}
            >
              <div className="text-sm font-medium">{f.expression}</div>
              <div className="mt-1 text-xs text-zinc-600">Tags: {f.tags.join(", ")}</div>
            </button>
          ))}
        </div>
        <div className="mt-2 text-xs text-zinc-500">
          Tap a formula to copy.
        </div>
      </section>
    </div>
  );
}

