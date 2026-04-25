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

  // Gemini API 호출
  const model = 'gemini-2.5-flash-lite';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const geminiResponse = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
        },
      }),
    });

    // Gemini가 한도 초과 (429) 또는 다른 에러 반환 시
    if (!geminiResponse.ok) {
      const errBody = await geminiResponse.text();
      console.error('[/api/translate] Gemini error:', geminiResponse.status, errBody);

      // 한도 초과를 그대로 클라이언트에 전달
      if (geminiResponse.status === 429) {
        return res.status(429).json({
          error: '오늘의 무료 한도에 도달했어요. 자정 이후 다시 시도해주세요.',
        });
      }

      return res.status(502).json({
        error: 'AI 응답을 받아오지 못했어요. 잠시 후 다시 시도해주세요.',
      });
    }

    const data = await geminiResponse.json();

    // Gemini 응답 형태에서 텍스트 추출
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) {
      console.error('[/api/translate] Empty response:', JSON.stringify(data));
      return res.status(502).json({ error: 'AI가 빈 응답을 반환했어요. 다시 시도해주세요.' });
    }

    return res.status(200).json({ text });
  } catch (err) {
    console.error('[/api/translate] fetch error:', err);
    return res.status(500).json({ error: '서버 오류가 발생했어요. 잠시 후 다시 시도해주세요.' });
  }
}
