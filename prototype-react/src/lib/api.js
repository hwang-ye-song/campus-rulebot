/**
 * OpenAI 호출 계층.
 *
 * 두 경로를 지원합니다.
 *  - 직접 호출: 브라우저에 입력한 키로 api.openai.com 호출 (시연용)
 *  - Edge Function 경유: Supabase Edge Function이 서버 시크릿으로 호출 (배포용, 키 노출 없음)
 */

const OPENAI_CHAT = 'https://api.openai.com/v1/chat/completions'
const OPENAI_EMBED = 'https://api.openai.com/v1/embeddings'

function edgeEndpoint(sbUrl) {
  return `${sbUrl.replace(/\/$/, '')}/functions/v1/ask`
}

async function callEdge(settings, payload) {
  const res = await fetch(edgeEndpoint(settings.sbUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.sbKey}`,
      apikey: settings.sbKey,
    },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({ error: '응답을 해석하지 못했습니다.' }))
  if (!res.ok || data.error) {
    throw new Error((data.error || `오류 ${res.status}`) + (data.detail ? ` — ${data.detail}` : ''))
  }
  return data
}

/** 텍스트 배열 → 임베딩 벡터 배열 */
export async function embed(settings, texts, model) {
  const embModel = model || settings.embModel
  if (settings.edgeOn) {
    const data = await callEdge(settings, { mode: 'embed', model: embModel, input: texts })
    return data.embeddings
  }
  const res = await fetch(OPENAI_EMBED, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
    body: JSON.stringify({ model: embModel, input: texts }),
  })
  if (!res.ok) {
    throw new Error(`임베딩 API 오류 ${res.status} — ${(await res.text()).slice(0, 240)}`)
  }
  const json = await res.json()
  return json.data.map((d) => d.embedding)
}

/** 근거 기반 답변 생성. 항상 {answerable, answer, used, caution, reason} 형태를 돌려줍니다. */
export async function chat(settings, system, user) {
  if (settings.edgeOn) {
    const data = await callEdge(settings, {
      mode: 'chat',
      model: settings.model,
      system,
      user,
    })
    return data.result
  }

  const payload = {
    model: settings.model,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  }

  const post = (body) =>
    fetch(OPENAI_CHAT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
      body: JSON.stringify(body),
    })

  let res = await post(payload)
  if (!res.ok) {
    const errText = await res.text()
    // 일부 최신 모델은 temperature를 받지 않습니다 — 제거 후 한 번 더 시도
    if (res.status === 400 && /temperature/i.test(errText)) {
      const { temperature, ...rest } = payload
      res = await post(rest)
      if (!res.ok) throw new Error(`API 오류 ${res.status} — ${(await res.text()).slice(0, 240)}`)
    } else {
      throw new Error(`API 오류 ${res.status} — ${errText.slice(0, 240)}`)
    }
  }

  const json = await res.json()
  const raw = json.choices?.[0]?.message?.content ?? '{}'
  try {
    return JSON.parse(raw)
  } catch {
    // 형식이 깨져도 추측 답변이 새어나가지 않도록 막습니다.
    return {
      answerable: false,
      answer: '답변 형식을 해석하지 못했습니다.',
      used: [],
      caution: '',
      reason: '모델 응답 형식 오류',
    }
  }
}

/* ────────────── Supabase REST ────────────── */

function sbHeaders(settings) {
  return {
    'Content-Type': 'application/json',
    apikey: settings.sbKey,
    Authorization: `Bearer ${settings.sbKey}`,
  }
}

export async function saveChunks(settings, rows) {
  const res = await fetch(`${settings.sbUrl.replace(/\/$/, '')}/rest/v1/kb_chunk`, {
    method: 'POST',
    headers: { ...sbHeaders(settings), Prefer: 'return=minimal' },
    body: JSON.stringify(rows),
  })
  if (!res.ok) throw new Error(`Supabase 오류 ${res.status} — ${(await res.text()).slice(0, 240)}`)
}

export async function loadChunks(settings) {
  const url = `${settings.sbUrl.replace(/\/$/, '')}/rest/v1/kb_chunk?select=chunk_id,title,source,content,embedding,doc_name&limit=5000`
  const res = await fetch(url, { headers: sbHeaders(settings) })
  if (!res.ok) throw new Error(`Supabase 오류 ${res.status} — ${(await res.text()).slice(0, 240)}`)
  const rows = await res.json()
  return rows.map((r) => ({
    id: r.chunk_id,
    title: r.title,
    chapter: r.doc_name,
    source: r.source,
    text: r.content,
    embedding: r.embedding,
  }))
}

export async function clearChunks(settings) {
  const res = await fetch(`${settings.sbUrl.replace(/\/$/, '')}/rest/v1/kb_chunk?id=gt.0`, {
    method: 'DELETE',
    headers: sbHeaders(settings),
  })
  if (!res.ok) throw new Error(`삭제 실패 ${res.status}`)
}

/** 질문 로그 적재. 학번·성명 등 식별 정보는 저장하지 않습니다. */
export async function logQuestion(settings, row) {
  if (!settings.sbReady) return
  try {
    await fetch(`${settings.sbUrl.replace(/\/$/, '')}/rest/v1/question_log`, {
      method: 'POST',
      headers: { ...sbHeaders(settings), Prefer: 'return=minimal' },
      body: JSON.stringify(row),
    })
  } catch {
    /* 로그 실패가 상담을 막지 않도록 조용히 넘어갑니다 */
  }
}

export async function loadLogs(settings) {
  const url = `${settings.sbUrl.replace(/\/$/, '')}/rest/v1/question_log?select=question,answerable,sources&limit=2000`
  const res = await fetch(url, { headers: sbHeaders(settings) })
  if (!res.ok) throw new Error(`Supabase 오류 ${res.status}`)
  return res.json()
}
