const crypto = require("crypto");
const { checkRateLimit } = require("./_rateLimit");
const { cacheGet, cacheSet } = require("./_cache");
const { JEE_QUIZ_SYSTEM_PROMPT } = require("./_quizPrompt");

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

function normalize(body) {
  const subject = String(body.subject || "").trim(); // optional
  const topic = String(body.topic || "").trim();
  const n = Number(body.nQuestions || 5);
  const difficulty = String(body.difficulty || "mixed").trim();

  const nQuestions = Number.isFinite(n) ? Math.max(3, Math.min(15, Math.floor(n))) : 5;
  if (!topic) return { ok: false, error: "Missing required field: topic" };

  const allowed = new Set(["easy", "medium", "hard", "mixed"]);
  if (!allowed.has(difficulty)) return { ok: false, error: "difficulty must be easy|medium|hard|mixed" };

  return { ok: true, subject, topic, nQuestions, difficulty };
}

function buildUserMessage({ subject, topic, nQuestions, difficulty }) {
  const lines = [];
  lines.push(`Create a quiz for JEE MAINS.`);
  if (subject) lines.push(`Subject preference: ${subject}`);
  lines.push(`Topic: ${topic}`);
  lines.push(`Number of questions: ${nQuestions}`);
  lines.push(`Difficulty: ${difficulty}`);
  lines.push(`Return strict JSON as per schema. Use unique ids.`);
  return lines.join("\n");
}

async function callOpenAI({ systemPrompt, userMessage }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const err = new Error("Missing OPENAI_API_KEY");
    err.code = "NO_KEY";
    throw err;
  }

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
      max_tokens: 1200,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`OpenAI error: ${res.status} ${res.statusText}`);
    err.details = text;
    throw err;
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
    // Attempt salvage if model accidentally wraps JSON in text
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
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

  const normalized = normalize(body);
  if (!normalized.ok) return json(400, { error: normalized.error });

  const userMessage = buildUserMessage(normalized);
  const cacheKey = sha256(`quiz:v1|${userMessage}`);
  const cached = cacheGet(cacheKey);
  if (cached) return json(200, { cached: true, cacheKey, quiz: cached });

  try {
    const raw = await callOpenAI({ systemPrompt: JEE_QUIZ_SYSTEM_PROMPT, userMessage });
    const quiz = parseStrictJson(raw);
    cacheSet(cacheKey, quiz);
    return json(200, { cached: false, cacheKey, quiz });
  } catch (err) {
    return json(500, {
      error: "Quiz service failed",
      details: process.env.NODE_ENV === "production" ? undefined : String(err?.details || err?.message || err),
    });
  }
};

