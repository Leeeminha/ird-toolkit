// /api/rag.js  (helper, imported by studio.js)
// Lightweight keyword-overlap retrieval over a small curated corpus.
// Not a vector DB — just enough to surface a few relevant excerpts to
// pass into the prompt as "reference material the model should prefer."

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Load the corpus without relying on JSON import attributes, whose syntax
// (`assert` vs `with`) differs across Node versions and can break on Vercel.
// readFileSync works regardless of the runtime's Node version.
const corpusPath = fileURLToPath(new URL("./corpus.json", import.meta.url));
const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));

// Very small tokenizer: lowercased word/Hangul runs.
function tokenize(s) {
  return (String(s || "").toLowerCase().match(/[a-z0-9]+|[가-힣]{2,}/g)) || [];
}

// Does any query token match this keyword?
// - exact match always counts
// - for Hangul keywords of length >= 2, also count if a query token CONTAINS
//   the keyword (e.g. "효율을" contains "효율"). This absorbs Korean particles
//   and verb endings that the whitespace tokenizer would otherwise split off.
//   English keywords stay exact-match (substring would over-match, e.g. "css"
//   inside "success"); 1-char keywords stay exact (avoid "물" inside "물건").
const HANGUL = /[가-힣]/;
function matches(kw, qTokensArr) {
  if (kw.length >= 2 && HANGUL.test(kw)) {
    return qTokensArr.some((t) => t === kw || t.includes(kw));
  }
  return qTokensArr.includes(kw);
}

// Score each corpus item by keyword overlap with the user's scenario text.
export function retrieve(queryText, k = 3) {
  const qTokensArr = tokenize(queryText);
  if (qTokensArr.length === 0) return [];

  const scored = corpus.map((item) => {
    const keys = (item.keywords || []).flatMap(tokenize);
    let score = 0;
    for (const kw of keys) if (matches(kw, qTokensArr)) score += 1;
    // also lightly reward overlap with the excerpt itself (exact only)
    for (const t of tokenize(item.excerpt)) if (qTokensArr.includes(t)) score += 0.2;
    return { item, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((s) => s.item);
}

// Format retrieved items as a compact reference block for the system prompt.
export function buildReferenceBlock(items) {
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
