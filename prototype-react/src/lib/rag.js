import { embed } from './api'

/* ───────── 한국어 대응 어휘 검색 ─────────
   조사 변화("휴학은/휴학이/휴학할")에 대응하기 위해 2글자 단위로 자릅니다. */
export function bigrams(s) {
  const clean = String(s || '').replace(/[^가-힣a-zA-Z0-9]/g, '')
  const out = []
  for (let i = 0; i < clean.length - 1; i++) out.push(clean.slice(i, i + 2))
  return out
}

export function lexicalSearch(kb, query, k = 6) {
  const qset = new Set(bigrams(query))
  if (!qset.size) return []
  return kb
    .map((c) => {
      const body = new Set(bigrams(`${c.title || ''} ${c.text}`))
      let hit = 0
      qset.forEach((g) => { if (body.has(g)) hit++ })

      const titleSet = new Set(bigrams(c.title || ''))
      let titleHit = 0
      qset.forEach((g) => { if (titleSet.has(g)) titleHit++ })

      const score = hit / qset.size + (titleHit / Math.max(1, titleSet.size)) * 1.4
      return { chunk: c, score }
    })
    .filter((x) => x.score > 0.06)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => x.chunk)
}

export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9)
}

/**
 * 근거 조문 검색.
 * 임베딩이 있고 API 호출이 가능하면 벡터 검색, 아니면 어휘 검색으로 내려갑니다.
 */
export async function retrieve(kb, query, settings, k = 6) {
  const hasVectors = kb.length > 0 && Array.isArray(kb[0].embedding)
  if (hasVectors && settings.canCall) {
    try {
      const [qv] = await embed(settings, [query])
      return kb
        .map((c) => ({ chunk: c, score: Array.isArray(c.embedding) ? cosine(qv, c.embedding) : -1 }))
        .sort((a, b) => b.score - a.score)
        .slice(0, k)
        .filter((x) => x.score > 0.15)
        .map((x) => x.chunk)
    } catch {
      // 임베딩 실패 시 어휘 검색으로 대체
    }
  }
  return lexicalSearch(kb, query, k)
}

/* ───────── 문서 → 조각 ───────── */

function clean(text) {
  return String(text)
    .replace(/ /g, ' ')
    .replace(/<개정[^>]*>|<신설[^>]*>/g, '')
    .replace(/\[전문개정[^\]]*\]|\[본조신설[^\]]*\]|\[제목개정[^\]]*\]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
}

/** 제○조 단위로 분할 — 답변에 조항 번호를 붙이기 위한 전제입니다. */
export function splitByArticle(text, docName) {
  const t = clean(text)
  const parts = t.split(/(?=제\s?\d+조(?:의\s?\d+)?\s?\()/)
  const out = []
  for (const part of parts) {
    const m = part.match(/^(제\s?\d+조(?:의\s?\d+)?)\s?\(([^)]{1,40})\)/)
    if (!m) continue
    const id = m[1].replace(/\s/g, '')
    const title = m[2].trim()
    const body = part.slice(m[0].length).replace(/제\d+장\s+[^\n]{1,20}/g, '').trim()
    if (body.length < 15 || body === '삭제') continue
    out.push({
      doc_name: docName,
      chunk_id: id,
      title,
      source: `${docName} ${id}(${title})`,
      content: body.slice(0, 1800),
    })
  }
  return out
}

/** 고정 길이 분할 — 조문 구조가 없는 안내문용 */
export function splitFixed(text, docName, size = 1000) {
  const t = clean(text)
  const out = []
  let cur = ''
  const push = () => {
    if (cur.trim().length > 40) {
      const n = out.length + 1
      out.push({
        doc_name: docName,
        chunk_id: `#${n}`,
        title: `조각 ${n}`,
        source: `${docName} — 조각 ${n}`,
        content: cur.trim(),
      })
    }
    cur = ''
  }
  for (const para of t.split(/\n+/)) {
    if ((cur + para).length > size) push()
    cur += (cur ? '\n' : '') + para
  }
  push()
  return out
}

/** 브라우저에서 PDF 텍스트 추출 (pdf.js는 index.html에서 로드) */
export async function extractPdfText(file, onPage) {
  const pdfjsLib = window.pdfjsLib
  if (!pdfjsLib) throw new Error('PDF 라이브러리를 불러오지 못했습니다. 네트워크를 확인해 주세요.')
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'

  const buf = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise
  const pages = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    pages.push(content.items.map((it) => it.str).join(' '))
    onPage?.(i, pdf.numPages)
  }
  return pages.join('\n')
}
