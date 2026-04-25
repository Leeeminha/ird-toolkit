// /api/studio.js
// Vercel Serverless Function — Studio AI (window.claude.complete polyfill용)
// Gemini 2.5 Flash-Lite 사용 (무료 tier, 1,000 RPD)
//
// Studio가 호출하는 형태:
//   window.claude.complete({ system: "...", messages: [{role, content}] })
// 반환: 문자열 (raw text)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[/api/studio] GEMINI_API_KEY not set');
    return res.status(500).json({ error: 'Server misconfigured: API key missing' });
  }

  // 요청 body 파싱
  let system, messages;
  try {
    const body = req.body || {};
    system = body.system || '';
    messages = Array.isArray(body.messages) ? body.messages : [];

    if (messages.length === 0) {
      return res.status(400).json({ error: 'Missing "messages" array' });
    }
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  // 너무 긴 요청 거부 (남용 방지)
  const totalLen =
    (system?.length || 0) +
    messages.reduce((sum, m) => sum + (m?.content?.length || 0), 0);
  if (totalLen > 12000) {
    return res.status(400).json({ error: 'Request too long' });
  }

  // Claude 형식 → Gemini 형식 변환
  // - Gemini의 system_instruction에 system 텍스트 매핑
  // - messages는 contents로 변환 (role: "user" → "user", "assistant" → "model")
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(m.content || '') }],
  }));

  const model = 'gemini-2.5-flash-lite';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const requestBody = {
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
    },
  };
  if (system) {
    requestBody.systemInstruction = {
      parts: [{ text: system }],
    };
  }

  try {
    const geminiResponse = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!geminiResponse.ok) {
      const errBody = await geminiResponse.text();
      console.error('[/api/studio] Gemini error:', geminiResponse.status, errBody);

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
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) {
      console.error('[/api/studio] Empty response:', JSON.stringify(data));
      return res.status(502).json({ error: 'AI가 빈 응답을 반환했어요. 다시 시도해주세요.' });
    }

    return res.status(200).json({ text });
  } catch (err) {
    console.error('[/api/studio] fetch error:', err);
    return res.status(500).json({ error: '서버 오류가 발생했어요. 잠시 후 다시 시도해주세요.' });
  }
}
