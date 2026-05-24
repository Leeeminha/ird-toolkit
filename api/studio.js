// /api/studio.js
// Vercel Serverless Function (CommonJS) — Rebound Design Studio AI proxy (Claude).
// Accepts EITHER contract, so it works regardless of how the frontend sends data:
//   (A) { prompt }                      — full instruction+scenario built client-side
//   (B) { system, messages }            — separate system + chat messages
// Lightly augments with corpus excerpts (light RAG) and returns { text }.

const { retrieve, buildReferenceBlock } = require("./rag.js");

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2048;

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[/api/studio] ANTHROPIC_API_KEY not set");
    return res.status(500).json({ error: "Server misconfigured: API key missing" });
  }

  // parse body — accept both { prompt } and { system, messages }
  let system = "";
  let messages = [];
  try {
    let body = req.body;
    if (typeof body === "string") body = JSON.parse(body);
    body = body || {};

    if (typeof body.prompt === "string" && body.prompt.trim()) {
      // contract (A): single prompt string → one user message
      messages = [{ role: "user", content: body.prompt }];
      system = "";
    } else {
      // contract (B): system + messages
      system = body.system || "";
      messages = Array.isArray(body.messages) ? body.messages : [];
    }

    if (messages.length === 0) {
      return res.status(400).json({ error: 'Missing "prompt" or "messages"' });
    }
  } catch (err) {
    console.error("[/api/studio] body parse error:", err);
    return res.status(400).json({ error: "Invalid JSON body: " + (err && err.message ? err.message : "unknown") });
  }

  // length guard (abuse prevention)
  const messageLen = messages.reduce((sum, m) => {
    if (typeof m.content === "string") return sum + m.content.length;
    if (Array.isArray(m.content)) {
      return sum + m.content.reduce((s, p) => s + (p && typeof p.text === "string" ? p.text.length : 0), 0);
    }
    return sum;
  }, 0);
  if ((system && system.length ? system.length : 0) + messageLen > 12000) {
    return res.status(400).json({ error: "Request too long" });
  }

  // ── light RAG: build retrieval query from all user text ──
  let queryText = "";
  for (const m of messages) {
    if (m.role !== "user") continue;
    if (typeof m.content === "string") queryText += " " + m.content;
    else if (Array.isArray(m.content)) {
      for (const p of m.content) if (p && p.type === "text") queryText += " " + (p.text || "");
    }
  }
  let augmentedSystem = system;
  try {
    const hits = retrieve(queryText, 3);
    const refBlock = buildReferenceBlock(hits);
    if (refBlock) augmentedSystem = (system || "") + (system ? "\n" : "") + refBlock.replace(/^\n/, "");
  } catch (err) {
    console.error("[/api/studio] RAG retrieve failed (continuing without it):", err && err.message ? err.message : err);
  }

  // ── call Anthropic ──
  try {
    const payload = {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: messages,
    };
    if (augmentedSystem) payload.system = augmentedSystem;

    const r = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      console.error("[/api/studio] Anthropic error:", r.status, errText);
      if (r.status === 429) {
        return res.status(429).json({ error: "지금 이용량이 많아요. 잠시 후 다시 시도해주세요." });
      }
      return res.status(502).json({ error: "AI 응답을 받아오는 데 실패했어요. 잠시 후 다시 시도해주세요." });
    }

    const data = await r.json();
    const text = Array.isArray(data && data.content)
      ? data.content.filter((b) => b && b.type === "text").map((b) => b.text).join("")
      : "";
    if (!text) {
      console.error("[/api/studio] Empty response:", JSON.stringify(data));
      return res.status(502).json({ error: "AI가 빈 응답을 반환했어요. 다시 시도해주세요." });
    }
    return res.status(200).json({ text });
  } catch (err) {
    console.error("[/api/studio] fetch error:", err);
    return res.status(500).json({ error: "서버 오류가 발생했어요. 잠시 후 다시 시도해주세요." });
  }
};
