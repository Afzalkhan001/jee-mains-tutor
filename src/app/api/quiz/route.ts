import { NextResponse } from "next/server";
import { cacheGet, cacheSet } from "../_shared/cache";
import { JEE_QUIZ_SYSTEM_PROMPT } from "../_shared/prompts";
import { checkRateLimit } from "../_shared/rateLimit";
import { getClientIp, parseStrictJson, sha256Hex } from "../_shared/utils";

function bad(status: number, msg: string) {
  return NextResponse.json({ error: msg }, { status });
}

type UnknownRecord = Record<string, unknown>;

function normalize(body: UnknownRecord) {
  const topic = String(body.topic ?? "").trim();
  const n = Number(body.nQuestions ?? 5);
  const difficulty = String(body.difficulty ?? "mixed").trim();
  const nQuestions = Number.isFinite(n) ? Math.max(3, Math.min(15, Math.floor(n))) : 5;

  const allowed = new Set(["easy", "medium", "hard", "mixed"]);
  if (!topic) return { ok: false as const, error: "Missing required field: topic" };
  if (!allowed.has(difficulty)) return { ok: false as const, error: "difficulty must be easy|medium|hard|mixed" };
  return { ok: true as const, topic, nQuestions, difficulty };
}

function buildUserMessage(x: { topic: string; nQuestions: number; difficulty: string }) {
  return [
    "Create a quiz for JEE MAINS.",
    `Topic: ${x.topic}`,
    `Number of questions: ${x.nQuestions}`,
    `Difficulty: ${x.difficulty}`,
    "Return strict JSON as per schema. Use unique ids.",
  ].join("\n");
}

async function callOpenAI(userMessage: string, nQuestions: number) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  // Dynamic max_tokens: ~300 tokens per question for full explanations
  // Minimum 1500, maximum 4500 to handle 3-15 questions
  const maxTokens = Math.max(1500, Math.min(4500, nQuestions * 300));

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
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: JEE_QUIZ_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
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

  const userMessage = buildUserMessage(n);
  const cacheKey = sha256Hex(`next-api:quiz:v1|${userMessage}`);
  const cached = cacheGet<unknown>(cacheKey);
  if (cached) return NextResponse.json({ cached: true, cacheKey, quiz: cached });

  try {
    const raw = await callOpenAI(userMessage, n.nQuestions);
    const quiz = parseStrictJson(raw);
    
    // Validate quiz structure
    if (!quiz || typeof quiz !== "object") {
      throw new Error("Invalid quiz structure: expected object");
    }
    if (!Array.isArray((quiz as { items?: unknown }).items)) {
      throw new Error("Invalid quiz structure: missing items array");
    }
    
    cacheSet(cacheKey, quiz, 1000 * 60 * 60 * 24); // 24h
    return NextResponse.json({ cached: false, cacheKey, quiz });
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : "Quiz failed";
    console.error("Quiz generation error:", errorMsg, e);
    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}

