import { NextResponse } from "next/server";
import { cacheGet, cacheSet } from "../_shared/cache";
import { JEE_TUTOR_SYSTEM_PROMPT } from "../_shared/prompts";
import { checkRateLimit } from "../_shared/rateLimit";
import { enforceBulletOnly, getClientIp, sha256Hex, simplifyLatexToPlain } from "../_shared/utils";

type Mode = "Beginner" | "Revision" | "Advanced (200+)";
type UnknownRecord = Record<string, unknown>;

function bad(status: number, msg: string) {
  return NextResponse.json({ error: msg }, { status });
}

function normalize(body: UnknownRecord) {
  const mode = String(body.mode ?? "").trim() as Mode;
  const question = String(body.question ?? "").trim();
  const subject = String(body.subject ?? "").trim();
  const chapter = String(body.chapter ?? "").trim();
  const subtopic = String(body.subtopic ?? "").trim();
  const imageDataUrl = String(body.imageDataUrl ?? "").trim();

  const allowedModes = new Set<Mode>(["Beginner", "Revision", "Advanced (200+)"]);
  if (!allowedModes.has(mode)) return { ok: false as const, error: "Invalid mode" };

  if (!question && !subtopic && !imageDataUrl) {
    return { ok: false as const, error: "Provide either subtopic or question or imageDataUrl" };
  }

  if (imageDataUrl && !imageDataUrl.startsWith("data:image/")) {
    return { ok: false as const, error: "imageDataUrl must be a data:image/* base64 data URL" };
  }

  // Hard limits to control cost + avoid huge payloads
  if (question.length > 2000) {
    return { ok: false as const, error: "Question too long. Please shorten to <= 2000 characters." };
  }
  if (imageDataUrl.length > 2_500_000) {
    return { ok: false as const, error: "Image too large. Please upload a smaller screenshot (try crop) and retry." };
  }

  return { ok: true as const, mode, question, subject, chapter, subtopic, imageDataUrl };
}

function buildUserMessage(x: {
  subject: string;
  chapter: string;
  subtopic: string;
  mode: string;
  question: string;
}) {
  const lines: string[] = [];
  if (x.subject) lines.push(`Subject: ${x.subject}`);
  if (x.chapter) lines.push(`Chapter: ${x.chapter}`);
  if (x.subtopic) lines.push(`Subtopic: ${x.subtopic}`);
  lines.push(`Tutor mode: ${x.mode}`);
  if (x.question) lines.push(`Question: ${x.question}`);
  return lines.join("\n");
}

function isSmallTalk(text: string) {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  // Very short greetings / acknowledgements
  const small = new Set([
    "hi",
    "hello",
    "hey",
    "hii",
    "hlo",
    "yo",
    "ok",
    "okay",
    "thanks",
    "thank you",
    "thx",
    "good morning",
    "good afternoon",
    "good evening",
  ]);
  if (small.has(t)) return true;
  // Single token <= 4 chars like "sup"
  if (/^[a-z]{1,4}$/.test(t) && !/[0-9]/.test(t)) return true;
  return false;
}

function smallTalkReply(mode: Mode) {
  // Keep bullet-only, but behave like a helpful coach.
  const modeHint =
    mode === "Beginner"
      ? "I’ll teach from basics + 1 key formula + common mistakes."
      : mode === "Revision"
        ? "I’ll give only scoring points: formulas + shortcuts + traps."
        : "I’ll focus on advanced edge-cases + option-elimination logic (200+).";

  return [
    `- Definition: I’m your JEE MAINS tutor chatbot.`,
    `- Formula: (Tell me topic/question first, then I’ll start with formulas.)`,
    `- Explanation: ${modeHint}`,
    `- Common mistakes: Writing vague doubts like “hi” gives no topic to solve.`,
    `- NTA trap alert: In exams, identify chapter + data + what is asked before solving.`,
    `- PYQ hint: Ask any PYQ screenshot and I’ll solve it fast.`,
    `- Tell me ONE of these now:`,
    `- (A) Subject + chapter + subtopic (example: Math → Vectors → Dot product)`,
    `- (B) Paste the full question`,
    `- (C) Upload the screenshot`,
    `- Quick commands:`,
    `- /quiz topic=Vectors n=5 difficulty=mixed`,
  ].join("\n");
}

async function callOpenAI(opts: { userMessage: string; imageDataUrl?: string }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const userContent: string | Array<Record<string, unknown>> = opts.imageDataUrl
    ? [
        { type: "text", text: opts.userMessage },
        { type: "image_url", image_url: { url: opts.imageDataUrl } },
      ]
    : opts.userMessage;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      top_p: 0.9,
      // Dynamic cap to reduce cost while keeping quality by mode.
      max_tokens:
        opts.userMessage.includes("Tutor mode: Beginner") ? 550 :
        opts.userMessage.includes("Tutor mode: Revision") ? 380 :
        750,
      messages: [
        { role: "system", content: JEE_TUTOR_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI error ${res.status}: ${text}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty OpenAI response");
  return String(content);
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rl = checkRateLimit(ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again in 60s." },
      { status: 429, headers: { "retry-after": String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad(400, "Invalid JSON body");
  }

  if (!body || typeof body !== "object") return bad(400, "Invalid JSON body");
  const n = normalize(body as UnknownRecord);
  if (!n.ok) return bad(400, n.error);

  const userMessage = buildUserMessage({
    subject: n.subject,
    chapter: n.chapter,
    subtopic: n.subtopic,
    mode: n.mode,
    question: n.question,
  });

  const cacheKey = sha256Hex(`next-api:tutor:v1|${userMessage}|img:${n.imageDataUrl ? sha256Hex(n.imageDataUrl) : "none"}`);
  const cached = cacheGet<string>(cacheKey);
  if (cached) return NextResponse.json({ cached: true, cacheKey, output: cached });

  try {
    // For greetings like "hi", don't waste tokens; respond like a smart coach.
    if (!n.imageDataUrl && isSmallTalk(n.question) && !n.subtopic && !n.chapter && !n.subject) {
      const output = smallTalkReply(n.mode);
      cacheSet(cacheKey, output, 1000 * 60 * 30); // 30 minutes
      return NextResponse.json({ cached: false, cacheKey, output });
    }

    const raw = await callOpenAI({ userMessage, imageDataUrl: n.imageDataUrl || undefined });
    const output = enforceBulletOnly(simplifyLatexToPlain(raw));
    cacheSet(cacheKey, output);
    return NextResponse.json({ cached: false, cacheKey, output });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Tutor failed" },
      { status: 500 }
    );
  }
}

