// /api/translate.js
// Vercel Serverless Function — Gemini API 프록시
// Gemini 2.5 Flash-Lite 사용 (무료 tier, 1,000 RPD)

export default async function handler(req, res) {
  // CORS 헤더 (같은 도메인이면 불필요하지만 안전)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // POST만 허용
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 환경변수 검증
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[/api/translate] GEMINI_API_KEY not set');
    return res.status(500).json({ error: 'Server misconfigured: API key missing' });
  }

  // 요청 body 파싱
  let prompt;
  try {
    const body = req.body || {};
    prompt = body.prompt;
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid "prompt" in body' });
    }
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  // 너무 긴 프롬프트는 거부 (남용 방지)
  if (prompt.length > 8000) {
    return res.status(400).json({ error: 'Prompt too long' });
  }

  // 모델 fallback 체인 — 429 시 다음 모델로 자동 전환
  // Translator는 텍스트 전용이라 Gemma도 사용 가능
  const modelChain = (process.env.GEMINI_MODELS || 'gemini-2.5-flash,gemini-2.5-flash-lite,gemma-3-27b-it,gemini-flash-latest')
    .split(',')
    .map(m => m.trim())
    .filter(Boolean);

  const requestBody = {
    contents: [
      { role: 'user', parts: [{ text: prompt }] },
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
    },
  };

  let last429Body = null;
  for (let i = 0; i < modelChain.length; i++) {
    const model = modelChain[i];
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    try {
      const geminiResponse = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (geminiResponse.status === 429) {
        last429Body = await geminiResponse.text();
        console.warn(`[/api/translate] Model ${model} quota hit (429), trying next...`);
        continue;
      }

      // 503 (overloaded), 500, 502, 504 — Google 서버 일시 문제. 다음 모델 시도.
      if (geminiResponse.status >= 500) {
        const errBody = await geminiResponse.text();
        console.warn(`[/api/translate] Model ${model} server error ${geminiResponse.status}, trying next... ${errBody.slice(0, 150)}`);
        continue;
      }

      if (!geminiResponse.ok) {
        const errBody = await geminiResponse.text();
        console.error(`[/api/translate] Gemini error on ${model}:`, geminiResponse.status, errBody);
        return res.status(502).json({
          error: 'AI 응답을 받아오지 못했어요. 잠시 후 다시 시도해주세요.',
        });
      }

      const data = await geminiResponse.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!text) {
        console.error('[/api/translate] Empty response on', model, ':', JSON.stringify(data));
        continue;
      }

      console.log(`[/api/translate] Success on model: ${model}`);
      return res.status(200).json({ text });
    } catch (err) {
      console.error(`[/api/translate] fetch error on ${model}:`, err);
      continue;
    }
  }

  if (last429Body) {
    console.error('[/api/translate] All models hit 429:', last429Body);
    return res.status(429).json({
      error: '오늘의 무료 한도에 도달했어요. 자정(Pacific Time) 이후 자동 리셋되어요.',
    });
  }
  return res.status(502).json({
    error: '모든 모델 호출이 실패했어요. 잠시 후 다시 시도해주세요.',
  });
}
