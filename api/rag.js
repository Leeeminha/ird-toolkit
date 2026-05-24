// /api/rag.js  (CommonJS helper, required by studio.js)
// Lightweight keyword-overlap retrieval over a small curated corpus.
// CommonJS so it runs whether or not the project sets "type":"module".

const { readFileSync } = require("node:fs");
const { join } = require("node:path");

// Load corpus.json from the same directory as this file.
let corpus = [];
try {
  const raw = readFileSync(join(__dirname, "corpus.json"), "utf8");
  corpus = JSON.parse(raw);
} catch (err) {
  // Never let a corpus load failure crash the function; just disable RAG.
  console.error("[/api/rag] failed to load corpus.json:", err && err.message ? err.message : err);
  corpus = [];
}

// Very small tokenizer: lowercased word/Hangul runs.
function tokenize(s) {
  return (String(s || "").toLowerCase().match(/[a-z0-9]+|[가-힣]{2,}/g)) || [];
}

// Score each corpus item by keyword overlap with the user's scenario text.
// Korean keywords (>=2 chars) use substring matching to absorb particles/endings;
// English and 1-char tokens use exact matching to avoid false hits.
function retrieve(queryText, k) {
  if (k === undefined) k = 3;
  const q = String(queryText || "").toLowerCase();
  const qTokens = new Set(tokenize(queryText));
  if (q.length === 0) return [];

  const isHangul = (s) => /[가-힣]/.test(s);

  const scored = corpus.map((item) => {
    const keys = item.keywords || [];
    let score = 0;
    for (const kw of keys) {
      const k2 = String(kw).toLowerCase();
      if (!k2) continue;
      if (isHangul(k2) && k2.length >= 2) {
        if (q.includes(k2)) score += 1;          // substring (absorbs 조사/어미)
      } else {
        if (qTokens.has(k2)) score += 1;         // exact for English / short tokens
      }
    }
    for (const t of tokenize(item.excerpt)) if (qTokens.has(t)) score += 0.2;
    return { item, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((s) => s.item);
}

// Format retrieved items as a compact reference block for the system prompt.
function buildReferenceBlock(items) {
  if (!items || items.length === 0) return "";
  const lines = items.map(
    (it) => `- [${it.label}] ${it.excerpt}${it.url ? ` (출처: ${it.url})` : ""}`
  );
  return [
    "",
    "# 참고 자료 (우선 활용)",
    "아래는 이 연구가 선별한 학술 문헌의 발췌입니다. 응답을 만들 때 이 자료를 **우선적으로** 참고하세요.",
    "다만 이 자료에만 갇히지 말고, 카드 주제에 더 잘 맞는 신뢰할 수 있는 출처를 알고 있다면 함께 활용해도 됩니다.",
    "refs를 제시할 때, 여기 포함된 자료의 출처(label/url)는 정확하므로 그대로 인용해도 안전합니다.",
    ...lines,
  ].join("\n");
}

module.exports = { retrieve, buildReferenceBlock };
