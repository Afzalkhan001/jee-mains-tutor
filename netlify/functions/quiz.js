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

  // Limit to 8 questions max to avoid Netlify function timeout (10s on free tier)
  // Each question takes ~1-2s to generate
  const nQuestions = Number.isFinite(n) ? Math.max(3, Math.min(8, Math.floor(n))) : 5;
  if (!topic) return { ok: false, error: "Missing required field: topic" };

  const allowed = new Set(["easy", "medium", "hard", "mixed"]);
  if (!allowed.has(difficulty)) return { ok: false, error: "difficulty must be easy|medium|hard|mixed" };

  return { ok: true, subject, topic, nQuestions, difficulty };
}

function buildUserMessage({ subject, topic, nQuestions, difficulty }) {
  const lines = [];
  lines.push(`Create a quiz for JEE MAINS.`);
  if (subject) lines.push(`Subject preference: ${subject}`);
  // Add explicit instruction to handle typos
  lines.push(`Topic: "${topic}" (please infer the intended JEE topic if misspelled)`);
  lines.push(`Number of questions: ${nQuestions}`);
  lines.push(`Difficulty: ${difficulty}`);
  lines.push(`Return strict JSON as per schema. Use unique ids.`);
  return lines.join("\n");
}

async function callOpenAI({ systemPrompt, userMessage, nQuestions }, retries = 1) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const err = new Error("Missing OPENAI_API_KEY");
    err.code = "NO_KEY";
    throw err;
  }

  // Dynamic max_tokens: ~300 tokens per question for full explanations
  // Minimum 1500, maximum 4500 to handle 3-8 questions
  const maxTokens = Math.max(1500, Math.min(4500, nQuestions * 300));

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" }, // FORCE VALID JSON
          temperature: 0.2,
          top_p: 0.9,
          max_tokens: maxTokens,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`OpenAI error: ${res.status} ${res.statusText} - ${text}`);
      }

      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error("Empty OpenAI response");
      return String(content);
    } catch (err) {
      if (attempt === retries) throw err;
      // Exponential backoff
      await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
    }
  }
}

function repairJson(broken) {
  let cleaned = broken.trim();
  // Remove markdown
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");

  // Try to find the outermost braces
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    cleaned = cleaned.slice(start, end + 1);
  } else {
    // Basic repair: if it starts with { but misses end, try adding it
    if (cleaned.startsWith("{") && !cleaned.endsWith("}")) cleaned += "}";
  }
  return cleaned;
}

function parseStrictJson(text) {
  // First attempt: direct parse
  try {
    return JSON.parse(text);
  } catch { }

  // Second attempt: cleanup markdown and extract object
  const clean = repairJson(text);
  try {
    return JSON.parse(clean);
  } catch (err) {
    throw new Error(`Invalid JSON from model: ${err.message}. Raw: ${text.substring(0, 100)}...`);
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
  const cacheKey = sha256(`quiz:v2|${userMessage}`); // bumped version
  const cached = cacheGet(cacheKey);
  if (cached) return json(200, { cached: true, cacheKey, quiz: cached });

  try {
    const raw = await callOpenAI({
      systemPrompt: JEE_QUIZ_SYSTEM_PROMPT,
      userMessage,
      nQuestions: normalized.nQuestions
    }, 1); // 1 retry allowed

    // JSON mode guarantees valid JSON, but we still parse carefully
    const quiz = parseStrictJson(raw);

    // Validate quiz structure
    if (!quiz || typeof quiz !== "object") {
      throw new Error("Invalid quiz structure: expected object");
    }
    if (!Array.isArray(quiz.items)) {
      throw new Error("Invalid quiz structure: missing items array");
    }

    cacheSet(cacheKey, quiz);
    return json(200, { cached: false, cacheKey, quiz });
  } catch (err) {
    const errorMsg = err?.message || "Quiz service failed";
    console.error("Quiz generation error:", errorMsg, err);
    // EXPOSE FULL ERROR DETAILS IN PRODUCTION FOR DEBUGGING
    return json(500, {
      error: errorMsg,
      details: String(err?.details || err?.message || err),
    });
  }
};
