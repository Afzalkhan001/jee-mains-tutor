import { NextResponse } from "next/server";
import { checkRateLimit } from "../_shared/rateLimit";
import { getClientIp, parseStrictJson, sha256Hex } from "../_shared/utils";
import { cacheGet, cacheSet } from "../_shared/cache";

type UnknownRecord = Record<string, unknown>;
type Difficulty = "easy" | "medium" | "hard" | "mixed";
type Subject = "math" | "physics" | "chemistry";

const PYQ_STYLE_SYSTEM_PROMPT = [
  "You are a JEE MAINS test-setter.",
  "Generate PYQ-style (exam-like) MCQs for practice.",
  "",
  "STRICT RULES:",
  "- Output MUST be valid JSON ONLY (no markdown, no extra text).",
  "- Do NOT claim these are official PYQs. They are PYQ-style practice.",
  "- Keep questions short, unambiguous, and calculation-friendly.",
  "- Provide brief solution and why other options are wrong.",
  "",
  "JSON SCHEMA (return exactly this shape):",
  "{",
  '  \"schemaVersion\": 1,',
  '  \"items\": [',
  "    {",
  '      \"id\": string,',
  '      \"year\": 2025,',
  '      \"subject\": \"math\"|\"physics\"|\"chemistry\",',
  '      \"chapter\": string,',
  '      \"difficulty\": \"easy\"|\"medium\"|\"hard\",',
  '      \"question\": string,',
  '      \"options\": [string,string,string,string],',
  '      \"correctIndex\": 0|1|2|3,',
  '      \"solution\": string,',
  '      \"whyOthersWrong\": [string,string,string]',
  "    }",
  "  ]",
  "}",
].join("\n");

function bad(status: number, msg: string) {
  return NextResponse.json({ error: msg }, { status });
}

function normalize(body: UnknownRecord) {
  const subject = String(body.subject ?? "").trim() as Subject | "";
  const topic = String(body.topic ?? "").trim();
  const difficulty = String(body.difficulty ?? "mixed").trim() as Difficulty;
  const n = Number(body.nQuestions ?? 5);
  const nQuestions = Number.isFinite(n) ? Math.max(3, Math.min(10, Math.floor(n))) : 5;

  const allowed = new Set<Difficulty>(["easy", "medium", "hard", "mixed"]);
  if (!allowed.has(difficulty)) return { ok: false as const, error: "difficulty must be easy|medium|hard|mixed" };
  if (subject && subject !== "math" && subject !== "physics" && subject !== "chemistry") {
    return { ok: false as const, error: "subject must be math|physics|chemistry" };
  }
  if (!topic) return { ok: false as const, error: "Missing required field: topic" };

  return { ok: true as const, subject, topic, difficulty, nQuestions };
}

function buildUserMessage(x: { subject?: string; topic: string; difficulty: Difficulty; nQuestions: number }) {
  const lines: string[] = [];
  lines.push("Create PYQ-style MCQs for JEE MAINS practice.");
  if (x.subject) lines.push(`Subject: ${x.subject}`);
  lines.push(`Topic: ${x.topic}`);
  lines.push(`Difficulty: ${x.difficulty}`);
  lines.push(`Number of questions: ${x.nQuestions}`);
  lines.push("Chapters should be specific (e.g., 'Kinematics', 'Vectors', 'Mole Concept').");
  lines.push("Return strict JSON only.");
  return lines.join("\n");
}

async function callOpenAI(userMessage: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

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
      max_tokens: 1400,
      messages: [
        { role: "system", content: PYQ_STYLE_SYSTEM_PROMPT },
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

  const userMessage = buildUserMessage({
    subject: n.subject || undefined,
    topic: n.topic,
    difficulty: n.difficulty,
    nQuestions: n.nQuestions,
  });

  const cacheKey = sha256Hex(`next-api:pyqgen:v1|${userMessage}`);
  const cached = cacheGet<unknown>(cacheKey);
  if (cached) return NextResponse.json({ cached: true, cacheKey, ...(cached as object) });

  try {
    const raw = await callOpenAI(userMessage);
    const parsed = parseStrictJson(raw) as { schemaVersion: 1; items: unknown[] };
    cacheSet(cacheKey, parsed, 1000 * 60 * 30); // 30 min
    return NextResponse.json(parsed);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "PYQ generation failed" },
      { status: 500 }
    );
  }
}

