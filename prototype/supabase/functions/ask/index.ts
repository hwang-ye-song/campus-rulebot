// ============================================================
//  Supabase Edge Function — "ask"
//
//  브라우저에 OpenAI 키를 노출하지 않기 위한 프록시입니다.
//  브라우저는 이 함수만 호출하고, 실제 OpenAI 호출은 서버에서 일어납니다.
//
//  배포:
//    supabase functions deploy ask --no-verify-jwt
//    supabase secrets set OPENAI_API_KEY=sk-...
//
//  호출:
//    POST /functions/v1/ask
//    { "mode": "chat",  "model": "...", "system": "...", "user": "..." }
//    { "mode": "embed", "model": "text-embedding-3-small", "input": ["...", "..."] }
// ============================================================

const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  if (!OPENAI_KEY) {
    return json({ error: "OPENAI_API_KEY 시크릿이 설정되지 않았습니다. `supabase secrets set OPENAI_API_KEY=sk-...` 를 실행하세요." }, 500);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON 본문을 읽을 수 없습니다." }, 400);
  }

  const mode = String(body.mode ?? "chat");

  try {
    // ── 임베딩 ────────────────────────────────────────────
    if (mode === "embed") {
      const input = body.input;
      if (!Array.isArray(input) || input.length === 0) {
        return json({ error: "input 배열이 필요합니다." }, 400);
      }
      if (input.length > 128) {
        return json({ error: "한 번에 128개까지만 임베딩할 수 있습니다." }, 400);
      }

      const r = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({
          model: String(body.model ?? "text-embedding-3-small"),
          input,
        }),
      });

      if (!r.ok) {
        return json({ error: `OpenAI 임베딩 오류 ${r.status}`, detail: (await r.text()).slice(0, 500) }, 502);
      }

      const j = await r.json();
      return json({ embeddings: j.data.map((d: { embedding: number[] }) => d.embedding) });
    }

    // ── 채팅 (근거 기반 답변 생성) ─────────────────────────
    if (mode === "chat") {
      const system = String(body.system ?? "");
      const user = String(body.user ?? "");
      if (!system || !user) {
        return json({ error: "system과 user 내용이 모두 필요합니다." }, 400);
      }

      const payload: Record<string, unknown> = {
        model: String(body.model ?? "gpt-5.6-luna"),
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      };
      const post = (b: unknown) =>
        fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${OPENAI_KEY}`,
          },
          body: JSON.stringify(b),
        });

      let r = await post(payload);
      if (!r.ok) {
        const errText = await r.text();
        // 일부 최신 모델은 temperature 파라미터를 받지 않습니다 — 제거 후 재시도
        if (r.status === 400 && /temperature/i.test(errText)) {
          delete payload.temperature;
          r = await post(payload);
          if (!r.ok) {
            return json({ error: `OpenAI 응답 오류 ${r.status}`, detail: (await r.text()).slice(0, 500) }, 502);
          }
        } else {
          return json({ error: `OpenAI 응답 오류 ${r.status}`, detail: errText.slice(0, 500) }, 502);
        }
      }

      const j = await r.json();
      const raw = j.choices?.[0]?.message?.content ?? "{}";

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        // 모델이 JSON을 깨뜨린 경우에도 추측 답변이 새어나가지 않도록 막습니다.
        return json({
          result: {
            answerable: false,
            answer: "답변 형식을 해석하지 못했습니다.",
            used: [],
            caution: "",
            reason: "모델 응답 형식 오류",
          },
        });
      }

      return json({ result: parsed, usage: j.usage ?? null });
    }

    return json({ error: `알 수 없는 mode: ${mode}` }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
