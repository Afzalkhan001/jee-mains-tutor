import crypto from "node:crypto";

export function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function getClientIp(req: Request) {
  // Next dev/proxy headers vary; try common ones.
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "";
  return req.headers.get("x-real-ip") || req.headers.get("x-nf-client-connection-ip") || "";
}

export function enforceBulletOnly(text: string) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const bulletLines = lines.map((l) => (l.startsWith("- ") ? l : `- ${l.replace(/^[-•]\s*/, "")}`));
  return bulletLines.join("\n");
}

export function simplifyLatexToPlain(text: string) {
  let s = String(text);
  // Remove math wrappers
  s = s.replace(/\\\(|\\\)|\\\[|\\\]/g, "");
  // Common commands to plain text
  s = s.replace(/\\hat\{([^}]+)\}/g, "$1_hat");
  s = s.replace(/\\sqrt\{([^}]+)\}/g, "sqrt($1)");
  // \frac{a}{b} -> a/b (best-effort, non-nested)
  s = s.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "($1)/($2)");
  // Remove remaining backslashes
  s = s.replace(/\\/g, "");
  // Remove excessive braces
  s = s.replace(/[{}]/g, "");
  // Clean spacing
  s = s.replace(/\s{2,}/g, " ").trim();
  return s;
}

export function parseStrictJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error("Invalid JSON from model");
  }
}

