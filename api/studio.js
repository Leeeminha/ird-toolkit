// /api/studio.js
// Vercel Serverless Function — Studio/Translator AI proxy.
// Proxies to the Anthropic Messages API using ANTHROPIC_API_KEY,
// and augments the system prompt with a few relevant corpus excerpts (light RAG).

import { retrieve, buildReferenceBlock } from "./rag.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2048;

export default async function handler(req, res) {
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

  let system, messages;
  try {
    let body = req.body;
    if (typeof body === "string") body = JSON.parse(body);
    body = body || {};
    system = body.system || "";
    messages = Array.isArray(body.messages) ? body.messages : [];
    if (messages.length === 0) {
      return res.status(400).json({ error: 'Missing "messages" array' });
    }
  } catch (err) {
    console.error("[/api/studio] body parse error:", err);
    return res.status(400).json({ error: "Invalid JSON body: " + (err?.message || "unknown") });
  }

  const messageLen = messages.reduce((sum, m) => {
    if (typeof m.content === "string") return sum + m.content.length;
    if (Array.isArray(m.content)) {
      return sum + m.content.reduce((s, p) => s + (typeof p?.text === "string" ? p.text.length : 0), 0);
    }
    return sum;
  }, 0);
  if ((system?.length || 0) + messageLen > 12000) {
    return res.status(400).json({ error: "Request too long" });
  }

  let queryText = "";
  for (const m of messages) {
    if (m.role !== "user") continue;
    if (typeof m.content === "string") queryText += " " + m.content;
    else if (Array.isArray(m.content)) {
      for (const p of m.content) if (p?.type === "text") queryText += " " + (p.text || "");
    }
  }
  let augmentedSystem = system;
  try {
    const hits = retrieve(queryText, 3);
    const refBlock = buildReferenceBlock(hits);
    if (refBlock) augmentedSystem = (system || "") + "\n" + refBlock;
  } catch (err) {
    console.error("[/api/studio] RAG skipped:", err?.message || err);
  }

  const apiMessages = messages.map((m) => {
    const role = m.role === "assistant" ? "assistant" : "user";
    let content;
    if (typeof m.content === "string") {
      content = m.content;
    } else if (Array.isArray(m.content)) {
      content = m.content
        .map((p) => {
          if (p?.type === "text") return { type: "text", text: String(p.text || "") };
          if (p?.type === "image" && p?.source?.type === "base64") {
            return {
              type: "image",
              source: {
                type: "base64",
                media_type: p.source.media_type || "image/png",
                data: p.source.data || "",
              },
            };
          }
          return null;
        })
        .filter(Boolean);
    } else {
      content = "";
    }
    return { role, content };
  });

  const requestBody = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    temperature: 0.7,
    messages: apiMessages,
  };
  if (augmentedSystem) requestBody.system = augmentedSystem;

  try {
    const r = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!r.ok) {
      const errBody = await r.text();
      console.error("[/api/studio] Anthropic error:", r.status, errBody);
      if (r.status === 429) {
        return res.status(429).json({ error: "요청이 잠시 몰렸어요. 잠시 후 다시 시도해주세요." });
      }
      return res.status(502).json({ error: "AI 응답을 받아오지 못했어요. 잠시 후 다시 시도해주세요." });
    }

    const data = await r.json();
    const text = Array.isArray(data?.content)
      ? data.content.filter((b) => b?.type === "text").map((b) => b.text).join("")
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
}
