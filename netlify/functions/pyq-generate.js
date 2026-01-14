const crypto = require("crypto");
const { checkRateLimit } = require("./_rateLimit");
const { cacheGet, cacheSet } = require("./_cache");

function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function getIp(event) {
  const h = event.headers || {};
  return (
    h["x-nf-client-connection-ip"] ||
    h["x-forwarded-for"]?.split(",")[0]?.trim() ||
    h["client-ip"] ||
    ""
  );
}

function json(statusCode, obj, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
    body: JSON.stringify(obj),
  };
}

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

function normalize(body) {
  const subject = String(body.subject || "").trim(); // optional
  const topic = String(body.topic || "").trim();
  const difficulty = String(body.difficulty || "mixed").trim();
  const n = Number(body.nQuestions || 5);
  const nQuestions = Number.isFinite(n) ? Math.max(3, Math.min(10, Math.floor(n))) : 5;

  const allowed = new Set(["easy", "medium", "hard", "mixed"]);
  if (!topic) return { ok: false, error: "Missing required field: topic" };
  if (subject && !["math", "physics", "chemistry"].includes(subject)) {
    return { ok: false, error: "subject must be math|physics|chemistry" };
  }
  if (!allowed.has(difficulty)) return { ok: false, error: "difficulty must be easy|medium|hard|mixed" };

  return { ok: true, subject, topic, difficulty, nQuestions };
}

function buildUserMessage({ subject, topic, difficulty, nQuestions }) {
  const lines = [];
  lines.push("Create PYQ-style MCQs for JEE MAINS practice.");
  if (subject) lines.push(`Subject: ${subject}`);
  lines.push(`Topic: ${topic}`);
  lines.push(`Difficulty: ${difficulty}`);
  lines.push(`Number of questions: ${nQuestions}`);
  lines.push("Chapters should be specific (e.g., 'Kinematics', 'Vectors', 'Mole Concept').");
  lines.push("Return strict JSON only.");
  return lines.join("\n");
}

async function callOpenAI({ systemPrompt, userMessage }) {
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
        { role: "system", content: systemPrompt },
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

function parseStrictJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error("Invalid JSON from model");
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" }, { allow: "POST" });
  }

  const ip = getIp(event);
  const rl = checkRateLimit(ip);
  if (!rl.ok) {
    return json(
      429,
      { error: "Rate limit exceeded. Try again in 60s." },
      { "retry-after": String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))) }
    );
  }

  let body;
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const n = normalize(body);
  if (!n.ok) return json(400, { error: n.error });

  const userMessage = buildUserMessage(n);
  const cacheKey = sha256(`pyqgen:v1|${userMessage}`);
  const cached = cacheGet(cacheKey);
  if (cached) return json(200, cached);

  try {
    const raw = await callOpenAI({ systemPrompt: PYQ_STYLE_SYSTEM_PROMPT, userMessage });
    const parsed = parseStrictJson(raw);
    cacheSet(cacheKey, parsed, 1000 * 60 * 30);
    return json(200, parsed);
  } catch (err) {
    return json(500, {
      error: "PYQ generation failed",
      details: process.env.NODE_ENV === "production" ? undefined : String(err?.message || err),
    });
  }
};

