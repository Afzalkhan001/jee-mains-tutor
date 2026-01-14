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

  // Conversation history for context-aware responses
  const conversationHistory = Array.isArray(body.conversationHistory)
    ? body.conversationHistory.slice(-6) // Limit to last 6 messages
    : [];

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

  return { ok: true, subject, chapter, subtopic, mode, question, imageDataUrl, conversationHistory };
}

function buildUserMessage({ subject, chapter, subtopic, mode, question }) {
  const lines = [];
  if (subject) lines.push(`Subject: ${subject}`);
  if (chapter) lines.push(`Chapter: ${chapter}`);
  if (subtopic) lines.push(`Subtopic: ${subtopic}`);
  lines.push(`Tutor mode: ${mode}`);
  if (question) lines.push(`\nStudent's question: ${question}`);
  return lines.join("\n");
}

// Build conversation messages array for OpenAI API
function buildMessages({ systemPrompt, userMessage, imageDataUrl, conversationHistory }) {
  const messages = [{ role: "system", content: systemPrompt }];

  // Add conversation history for context
  for (const msg of conversationHistory) {
    if (msg.role === "user" && msg.text) {
      messages.push({ role: "user", content: msg.text });
    } else if (msg.role === "assistant" && msg.text) {
      messages.push({ role: "assistant", content: msg.text });
    }
  }

  // Add the current user message
  if (imageDataUrl) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: userMessage },
        { type: "image_url", image_url: { url: imageDataUrl } },
      ],
    });
  } else {
    messages.push({ role: "user", content: userMessage });
  }

  return messages;
}

// Get max tokens based on mode - increased for thorough explanations
function getMaxTokens(mode) {
  switch (mode) {
    case "Beginner":
      return 1200; // Was 550 - need room for detailed explanations
    case "Revision":
      return 800;  // Was 380 - still concise but not too restrictive
    case "Advanced (200+)":
      return 1600; // Was 750 - need room for derivations and edge cases
    default:
      return 1000;
  }
}

async function callOpenAI({ systemPrompt, userMessage, imageDataUrl, conversationHistory, mode }, retries = 1) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const err = new Error("Missing OPENAI_API_KEY");
    err.code = "NO_KEY";
    throw err;
  }

  const messages = buildMessages({ systemPrompt, userMessage, imageDataUrl, conversationHistory });

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
          temperature: 0.3, // Slightly higher for more natural responses
          top_p: 0.9,
          max_tokens: getMaxTokens(mode),
          messages,
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
      await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
    }
  }
}

// Simplified LaTeX cleanup - keep natural formatting
function cleanupResponse(text) {
  let s = String(text);

  // Remove LaTeX delimiters if present
  s = s.replace(/\\\(|\\\)|\\\[|\\\]/g, "");

  // Convert common LaTeX to readable format
  s = s.replace(/\\hat\{([^}]+)\}/g, "$1_hat");
  s = s.replace(/\\vec\{([^}]+)\}/g, "$1_vec");
  s = s.replace(/\\sqrt\{([^}]+)\}/g, "sqrt($1)");
  s = s.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "($1)/($2)");
  s = s.replace(/\\times/g, "×");
  s = s.replace(/\\cdot/g, "·");
  s = s.replace(/\\pm/g, "±");
  s = s.replace(/\\leq/g, "≤");
  s = s.replace(/\\geq/g, "≥");
  s = s.replace(/\\neq/g, "≠");
  s = s.replace(/\\approx/g, "≈");
  s = s.replace(/\\theta/g, "θ");
  s = s.replace(/\\alpha/g, "α");
  s = s.replace(/\\beta/g, "β");
  s = s.replace(/\\gamma/g, "γ");
  s = s.replace(/\\omega/g, "ω");
  s = s.replace(/\\pi/g, "π");
  s = s.replace(/\\Delta/g, "Δ");
  s = s.replace(/\\infty/g, "∞");

  // Remove remaining backslashes from LaTeX commands
  s = s.replace(/\\([a-zA-Z]+)/g, "$1");
  s = s.replace(/[{}]/g, "");

  return s.trim();
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

  // Include conversation history in cache key for context-aware caching
  const historyHash = normalized.conversationHistory.length > 0
    ? sha256(JSON.stringify(normalized.conversationHistory.map(m => m.text || "")))
    : "none";
  const cacheKey = sha256(`v3|${userMessage}|img:${normalized.imageDataUrl ? sha256(normalized.imageDataUrl) : "none"}|hist:${historyHash}`);

  const cached = cacheGet(cacheKey);
  if (cached) {
    return json(200, { cached: true, cacheKey, output: cached });
  }

  try {
    const raw = await callOpenAI({
      systemPrompt: JEE_TUTOR_SYSTEM_PROMPT,
      userMessage,
      imageDataUrl: normalized.imageDataUrl || "",
      conversationHistory: normalized.conversationHistory,
      mode: normalized.mode,
    });
    const output = cleanupResponse(raw);
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
