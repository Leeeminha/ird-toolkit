// /api/rag.js  (helper, imported by studio.js)
// Lightweight keyword-overlap retrieval over a small curated corpus.

import corpus from "./corpus.json" assert { type: "json" };

function tokenize(s) {
  return (String(s || "").toLowerCase().match(/[a-z0-9]+|[가-힣]{2,}/g)) || [];
}

export function retrieve(queryText, k = 3) {
  const qTokens = new Set(tokenize(queryText));
  if (qTokens.size === 0) return [];

  const scored = corpus.map((item) => {
    const keys = (item.keywords || []).flatMap(tokenize);
    let score = 0;
    for (const kw of keys) if (qTokens.has(kw)) score += 1;
    for (const t of tokenize(item.excerpt)) if (qTokens.has(t)) score += 0.2;
    return { item, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((s) => s.item);
}

export function buildReferenceBlock(items) {
  if (!items || items.length === 0) return "";
  const lines = items.map(
    (it) => `- [${it.label}] ${it.excerpt}${it.url ? ` (출처: ${it.url})` : ""}`
  );
  return [
    "",
    "# 참고 자료 (우선 활용)",
    "아래는 이 연구가 선별한 학술 문헌의 발췌입니다. 응답을 만들 때 이 자료를 우선적으로 참고하세요.",
    "다만 이 자료에만 갇히지 말고, 카드 주제에 더 잘 맞는 신뢰할 수 있는 출처를 알고 있다면 함께 활용해도 됩니다.",
    "refs를 제시할 때, 여기 포함된 자료의 출처(label/url)는 정확하므로 그대로 인용해도 안전합니다.",
    ...lines,
  ].join("\n");
}
