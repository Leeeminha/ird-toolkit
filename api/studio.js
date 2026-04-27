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

  // 요청 body 파싱 — Vercel은 일반적으로 자동 parse하지만, 안전하게 string도 처리
  let system, messages;
  try {
    let body = req.body;
    if (typeof body === 'string') {
      body = JSON.parse(body);
    }
    body = body || {};
    system = body.system || '';
    messages = Array.isArray(body.messages) ? body.messages : [];

    if (messages.length === 0) {
      return res.status(400).json({ error: 'Missing "messages" array' });
    }
  } catch (err) {
    console.error('[/api/studio] body parse error:', err);
    return res.status(400).json({ error: 'Invalid JSON body: ' + (err?.message || 'unknown') });
  }

  // 너무 긴 요청 거부 (남용 방지) — content가 array면 text 부분만 합산
  const messageLen = messages.reduce((sum, m) => {
    if (typeof m.content === 'string') return sum + m.content.length;
    if (Array.isArray(m.content)) {
      return sum + m.content.reduce((s, p) => s + (typeof p?.text === 'string' ? p.text.length : 0), 0);
    }
    return sum;
  }, 0);
  const totalLen = (system?.length || 0) + messageLen;
  if (totalLen > 12000) {
    return res.status(400).json({ error: 'Request too long' });
  }

  // Claude 형식 → Gemini 형식 변환
  // - system 텍스트 → systemInstruction
  // - messages → contents (role: "assistant" → "model")
  // - content가 string이면 text part 하나, array면 (text/image) parts로 매핑
  const contents = messages.map((m) => {
    const role = m.role === 'assistant' ? 'model' : 'user';
    let parts;
    if (typeof m.content === 'string') {
      parts = [{ text: String(m.content || '') }];
    } else if (Array.isArray(m.content)) {
      parts = m.content.map((p) => {
        if (p?.type === 'text') {
          return { text: String(p.text || '') };
        }
        if (p?.type === 'image' && p?.source?.type === 'base64') {
          return {
            inlineData: {
              mimeType: p.source.media_type || 'image/png',
              data: p.source.data || '',
            },
          };
        }
        return { text: '' };
      }).filter(Boolean);
    } else {
      parts = [{ text: '' }];
    }
    return { role, parts };
  });

  // 모델 fallback 체인 — 429 시 다음 모델로 자동 전환
  // 환경변수 GEMINI_MODELS로 override 가능 (콤마 구분)
  // Gemma 3는 멀티모달 지원 (이미지+텍스트 모두 OK), system은 user 메시지에 prepend됨.
  const modelChain = (process.env.GEMINI_MODELS || 'gemini-2.5-flash,gemini-2.5-flash-lite,gemma-3-27b-it,gemini-flash-latest')
    .split(',')
    .map(m => m.trim())
    .filter(Boolean);

  let last429Body = null;
  for (let i = 0; i < modelChain.length; i++) {
    const model = modelChain[i];
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    // 모델별 body 구성 — Gemma는 systemInstruction 미지원, 첫 user 메시지에 prepend
    const isGemma = model.toLowerCase().startsWith('gemma');
    let bodyContents = contents;
    if (isGemma && system && contents.length > 0) {
      // 첫 user 메시지의 첫 text part에 system 내용을 합침
      bodyContents = contents.map((c, idx) => {
        if (idx !== 0 || c.role !== 'user') return c;
        const newParts = c.parts.map((p, pIdx) => {
          if (pIdx !== 0 || !p.text) return p;
          return { text: `[SYSTEM]\n${system}\n[/SYSTEM]\n\n${p.text}` };
        });
        return { ...c, parts: newParts };
      });
    }
    const requestBody = {
      contents: bodyContents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
      },
    };
    if (system && !isGemma) {
      requestBody.systemInstruction = { parts: [{ text: system }] };
    }

    try {
      const geminiResponse = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (geminiResponse.status === 429) {
        // 이 모델은 quota 초과. 다음 모델 시도.
        last429Body = await geminiResponse.text();
        console.warn(`[/api/studio] Model ${model} quota hit (429), trying next...`);
        continue;
      }

      // 503 (overloaded), 500, 502, 504 — Google 서버 일시 문제. 다음 모델 시도.
      if (geminiResponse.status >= 500) {
        const errBody = await geminiResponse.text();
        console.warn(`[/api/studio] Model ${model} server error ${geminiResponse.status}, trying next... ${errBody.slice(0, 150)}`);
        continue;
      }

      if (!geminiResponse.ok) {
        const errBody = await geminiResponse.text();
        console.error(`[/api/studio] Gemini error on ${model}:`, geminiResponse.status, errBody);
        return res.status(502).json({
          error: 'AI 응답을 받아오지 못했어요. 잠시 후 다시 시도해주세요.',
        });
      }

      const data = await geminiResponse.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!text) {
        console.error('[/api/studio] Empty response on', model, ':', JSON.stringify(data));
        // 빈 응답이면 다음 모델 시도
        continue;
      }

      console.log(`[/api/studio] Success on model: ${model}`);
      return res.status(200).json({ text });
    } catch (err) {
      console.error(`[/api/studio] fetch error on ${model}:`, err);
      // network 에러도 다음 모델 시도
      continue;
    }
  }

  // 모든 모델이 실패한 경우
  if (last429Body) {
    console.error('[/api/studio] All models hit 429:', last429Body);
    return res.status(429).json({
      error: '오늘의 무료 한도에 도달했어요. 자정(Pacific Time) 이후 자동 리셋되어요.',
    });
  }
  return res.status(502).json({
    error: '모든 모델 호출이 실패했어요. 잠시 후 다시 시도해주세요.',
  });
}
