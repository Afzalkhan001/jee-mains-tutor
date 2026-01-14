const crypto = require("crypto");
const { JEE_TUTOR_SYSTEM_PROMPT } = require("./_prompt");
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

function normalizeInput(body) {
  const subject = String(body.subject || "").trim().toLowerCase(); // optional
  const chapter = String(body.chapter || "").trim(); // optional
  const subtopic = String(body.subtopic || "").trim(); // optional
  const mode = String(body.mode || "").trim();
  const question = String(body.question || "").trim();
  const imageDataUrl = String(body.imageDataUrl || "").trim(); // optional: data:image/...;base64,...

  if (!mode) {
    return { ok: false, error: "Missing required field: mode" };
  }

  const allowedModes = new Set(["Beginner", "Revision", "Advanced (200+)"]);
  if (!allowedModes.has(mode)) {
    return { ok: false, error: "Invalid mode. Use: Beginner | Revision | Advanced (200+)" };
  }

  // Require at least some context
  if (!question && !subtopic && !imageDataUrl) {
    return { ok: false, error: "Provide either subtopic or question or imageDataUrl" };
  }

  // Quick safety: only allow data URLs for images (avoid SSRF via arbitrary URLs).
  if (imageDataUrl && !imageDataUrl.startsWith("data:image/")) {
    return { ok: false, error: "imageDataUrl must be a data:image/* base64 data URL" };
  }

  // Hard limits to control cost + avoid huge payloads
  if (question.length > 2000) {
    return { ok: false, error: "Question too long. Please shorten to <= 2000 characters." };
  }
  if (imageDataUrl.length > 2_500_000) {
    return { ok: false, error: "Image too large. Please upload a smaller screenshot (try crop) and retry." };
  }

  return { ok: true, subject, chapter, subtopic, mode, question, imageDataUrl };
}

function buildUserMessage({ subject, chapter, subtopic, mode, question }) {
  const lines = [];
  if (subject) lines.push(`Subject: ${subject}`);
  if (chapter) lines.push(`Chapter: ${chapter}`);
  if (subtopic) lines.push(`Subtopic: ${subtopic}`);
  lines.push(`Tutor mode: ${mode}`);
  if (question) lines.push(`Question: ${question}`);
  return lines.join("\n");
}

async function callOpenAI({ systemPrompt, userMessage, imageDataUrl }) {
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
      max_tokens: userMessage.includes("Tutor mode: Beginner")
        ? 550
        : userMessage.includes("Tutor mode: Revision")
          ? 380
          : 750,
      messages: [
        { role: "system", content: systemPrompt },
        imageDataUrl
          ? {
              role: "user",
              content: [
                { type: "text", text: userMessage },
                { type: "image_url", image_url: { url: imageDataUrl } },
              ],
            }
          : { role: "user", content: userMessage },
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

function enforceBulletOnly(text) {
  // Safety post-processor: ensure each non-empty line is a bullet.
  const lines = String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const bulletLines = lines.map((l) => (l.startsWith("- ") ? l : `- ${l.replace(/^[-•]\s*/, "")}`));
  return bulletLines.join("\n");
}

function simplifyLatexToPlain(text) {
  let s = String(text);
  s = s.replace(/\\\(|\\\)|\\\[|\\\]/g, "");
  s = s.replace(/\\hat\{([^}]+)\}/g, "$1_hat");
  s = s.replace(/\\sqrt\{([^}]+)\}/g, "sqrt($1)");
  s = s.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "($1)/($2)");
  s = s.replace(/\\/g, "");
  s = s.replace(/[{}]/g, "");
  s = s.replace(/\s{2,}/g, " ").trim();
  return s;
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

  const normalized = normalizeInput(body);
  if (!normalized.ok) return json(400, { error: normalized.error });

  const userMessage = buildUserMessage(normalized);
  const cacheKey = sha256(`v2|${userMessage}|img:${normalized.imageDataUrl ? sha256(normalized.imageDataUrl) : "none"}`);

  const cached = cacheGet(cacheKey);
  if (cached) {
    return json(200, { cached: true, cacheKey, output: cached });
  }

  try {
    const raw = await callOpenAI({
      systemPrompt: JEE_TUTOR_SYSTEM_PROMPT,
      userMessage,
      imageDataUrl: normalized.imageDataUrl || "",
    });
    const output = enforceBulletOnly(simplifyLatexToPlain(raw));
    cacheSet(cacheKey, output);
    return json(200, { cached: false, cacheKey, output });
  } catch (err) {
    const code = err?.code || "OPENAI_ERROR";
    return json(500, {
      error: "Tutor service failed",
      code,
      details: process.env.NODE_ENV === "production" ? undefined : String(err?.details || err?.message || err),
    });
  }
};

