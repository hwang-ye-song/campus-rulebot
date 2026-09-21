import { useCallback, useRef, useState } from 'react'
import { clearChunks, embed, loadChunks, saveChunks } from '../lib/api'
import { extractPdfText, splitByArticle, splitFixed } from '../lib/rag'
import { MODELS } from '../lib/config'

const SCHEMA_SQL = `create table if not exists kb_chunk (
  id bigserial primary key,
  created_at timestamptz default now(),
  doc_name text not null,
  chunk_id text,
  title text,
  source text not null,
  content text not null,
  embedding jsonb
);
create table if not exists question_log (
  id bigserial primary key,
  created_at timestamptz default now(),
  question text not null,
  campus text, grade int,
  answerable boolean,
  sources text[]
);
alter table kb_chunk     enable row level security;
alter table question_log enable row level security;
create policy "kb all"  on kb_chunk     for all using (true) with check (true);
create policy "log all" on question_log for all using (true) with check (true);`

export default function KbBuilder({ settings, onReplaceKb }) {
  const [log, setLog] = useState([])
  const [progress, setProgress] = useState(null)
  const [chunks, setChunks] = useState([])
  const [docName, setDocName] = useState('')
  const [mode, setMode] = useState('article')
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  const say = useCallback((text, cls) => setLog((prev) => [...prev, { text, cls }]), [])

  const handleFiles = useCallback(
    async (files) => {
      setLog([])
      setChunks([])
      let collected = []

      for (const file of files) {
        say(`▸ ${file.name} 읽는 중…`)
        let text = ''
        try {
          text = /\.pdf$/i.test(file.name)
            ? await extractPdfText(file, (i, n) => say(`  · ${i}/${n}쪽 추출`))
            : await file.text()
        } catch (e) {
          say(`  ✕ 읽기 실패: ${e.message}`, 'e')
          continue
        }

        const name = docName.trim() || file.name.replace(/\.[^.]+$/, '')
        if (!docName.trim()) setDocName(name)

        let parts = mode === 'article' ? splitByArticle(text, name) : splitFixed(text, name)
        if (mode === 'article' && parts.length < 3) {
          say('  · 조문 패턴을 찾지 못해 고정 길이로 전환합니다', 'e')
          parts = splitFixed(text, name)
        }
        collected = collected.concat(parts)
        say(`  ✓ ${text.length.toLocaleString()}자 → ${parts.length}개 조각`, 'k')
      }

      setChunks(collected)
      if (collected.length) say(`총 ${collected.length}개 조각 준비 완료. 「임베딩 생성 후 저장」을 누르세요.`, 'k')
    },
    [docName, mode, say]
  )

  async function build() {
    if (!chunks.length) return
    setBusy(true)
    try {
      say(`▸ 임베딩 생성 시작 (${settings.embModel}, ${chunks.length}개)`)
      const batch = 64
      const vectors = []
      for (let i = 0; i < chunks.length; i += batch) {
        const slice = chunks.slice(i, i + batch)
        const vs = await embed(settings, slice.map((c) => `${c.title}\n${c.content}`))
        vectors.push(...vs)
        setProgress((i + slice.length) / chunks.length)
        say(`  · ${i + slice.length}/${chunks.length} 완료`)
      }
      const withVectors = chunks.map((c, i) => ({ ...c, embedding: vectors[i] }))
      say('  ✓ 임베딩 완료', 'k')

      if (settings.sbReady) {
        say('▸ Supabase 저장 중…')
        const b2 = 40
        for (let i = 0; i < withVectors.length; i += b2) {
          await saveChunks(settings, withVectors.slice(i, i + b2))
          say(`  · ${Math.min(i + b2, withVectors.length)}/${withVectors.length} 저장`)
        }
        say('  ✓ Supabase 저장 완료', 'k')
      } else {
        say('  · Supabase 미연동 — 이번 세션에서만 사용됩니다', 'e')
      }

      onReplaceKb(
        withVectors.map((c) => ({
          id: c.chunk_id, title: c.title, chapter: c.doc_name,
          source: c.source, text: c.content, embedding: c.embedding,
        })),
        '업로드 문서 · 벡터 검색'
      )
      say('▸ 지식베이스 교체 완료 — 「학생 화면」에서 이 문서를 근거로 답합니다.', 'k')
    } catch (e) {
      say(`✕ ${e.message}`, 'e')
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  async function pull() {
    setLog([])
    say('▸ Supabase에서 불러오는 중…')
    try {
      const rows = await loadChunks(settings)
      if (!rows.length) { say('  · 저장된 조각이 없습니다', 'e'); return }
      onReplaceKb(rows, 'Supabase · 벡터 검색')
      say(`  ✓ ${rows.length}개 조각을 불러왔습니다`, 'k')
    } catch (e) { say(`✕ ${e.message}`, 'e') }
  }

  async function wipe() {
    if (!window.confirm('Supabase의 kb_chunk 테이블을 모두 삭제합니다. 되돌릴 수 없습니다. 계속할까요?')) return
    try { await clearChunks(settings); say('  ✓ 삭제되었습니다', 'k') }
    catch (e) { say(`✕ ${e.message}`, 'e') }
  }

  return (
    <div className="wrap">
      <section className="box">
        <h2>규정 문서 올리기 <small>PDF · TXT · MD</small></h2>
        <div className="pad">
          <div
            className={`drop${over ? ' over' : ''}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setOver(true) }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); handleFiles(e.dataTransfer.files) }}
          >
            <div className="big">파일을 끌어다 놓거나 클릭해서 선택</div>
            <div className="s">
              학칙, 학사운영규정, 수강신청 안내문 등
              <br />PDF는 브라우저에서 바로 텍스트를 추출합니다
            </div>
            <input
              ref={fileRef} type="file" accept=".pdf,.txt,.md" multiple hidden
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            <label>문서명</label>
            <input type="text" value={docName} placeholder="예: 한양대학교 학칙(2024.10.31. 개정)"
              onChange={(e) => setDocName(e.target.value)} />
          </div>
          <div className="row">
            <label>분할 방식</label>
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="article">조문 단위 (제○조 기준 · 규정 문서 권장)</option>
              <option value="fixed">고정 길이 (1000자 · 일반 문서)</option>
            </select>
          </div>
          <div className="row">
            <label>임베딩</label>
            <select value={settings.embModel} onChange={(e) => settings.setEmbModel(e.target.value)}>
              <option value="text-embedding-3-small">text-embedding-3-small (저렴)</option>
              <option value="text-embedding-3-large">text-embedding-3-large (정확)</option>
            </select>
          </div>

          <div className="btnrow">
            <button className="btn" disabled={!chunks.length || !settings.canCall || busy} onClick={build}>
              임베딩 생성 후 저장
            </button>
            <button className="btn sec" disabled={!chunks.length}
              onClick={() => chunks.slice(0, 8).forEach((c) => say(`  · [${c.chunk_id}] ${c.title} · ${c.content.length}자`))}>
              분할 결과만 미리보기
            </button>
          </div>

          {progress !== null && (
            <div className="prog"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>
          )}

          {log.length > 0 && (
            <div className="plog">
              {log.map((l, i) => <div key={i} className={l.cls}>{l.text}</div>)}
            </div>
          )}
        </div>
      </section>

      <section className="box">
        <h2>모델 호출 설정 <small>키는 이 브라우저에만 저장됩니다</small></h2>
        <div className="pad">
          <div className="row">
            <label style={{ paddingTop: 3 }}>호출 방식</label>
            <div style={{ flex: 1 }}>
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={settings.rawEdge}
                  onChange={(e) => settings.toggleEdge(e.target.checked)}
                />
                Edge Function 경유 (권장 · 키 노출 없음)
              </label>
            </div>
          </div>

          {!settings.rawEdge && (
            <div className="row">
              <label>API 키</label>
              <input
                type="password" placeholder="sk-..."
                value={settings.apiKey}
                onChange={(e) => settings.setApiKey(e.target.value)}
              />
            </div>
          )}

          <div className="row">
            <label>답변 모델</label>
            <select value={settings.model} onChange={(e) => settings.setModel(e.target.value)}>
              {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>

          <div className={`hint ${settings.canCall ? 'g' : ''}`}>
            {settings.rawEdge && !settings.sbReady
              ? 'Edge Function을 쓰려면 아래 Supabase URL과 키를 먼저 입력하세요.'
              : settings.edgeOn
              ? 'Edge Function(/functions/v1/ask) 경유. OpenAI 키는 서버 시크릿에 있으며 브라우저에 노출되지 않습니다.'
              : settings.apiKey
              ? `${settings.model} 모델이 학칙 조문을 근거로 답변합니다.`
              : 'API 키를 입력하거나 Edge Function 경유를 켜야 답변이 생성됩니다.'}
          </div>
        </div>
      </section>

      <section className="box">
        <h2>Supabase <small>벡터 저장소</small></h2>
        <div className="pad">
          <div className="row">
            <label>URL</label>
            <input type="text" value={settings.sbUrl} placeholder="https://xxxx.supabase.co"
              onChange={(e) => settings.setSbUrl(e.target.value)} />
          </div>
          <div className="row">
            <label>anon key</label>
            <input type="password" value={settings.sbKey} placeholder="eyJ..."
              onChange={(e) => settings.setSbKey(e.target.value)} />
          </div>
          <div className={`hint ${settings.sbReady ? 'g' : ''}`}>
            {settings.sbReady
              ? '연동됨. 지식베이스와 질문 로그가 Supabase에 저장됩니다.'
              : '미연동 상태입니다. 입력하지 않으면 이 브라우저 메모리에만 남습니다.'}
          </div>

          <div className="btnrow">
            <button className="btn sec" onClick={pull} disabled={!settings.sbReady}>저장된 지식베이스 불러오기</button>
            <button className="btn warn" onClick={wipe} disabled={!settings.sbReady}>전체 삭제</button>
          </div>

          <p className="fine">Supabase SQL 편집기에서 아래를 먼저 실행하세요.</p>
          <pre>{SCHEMA_SQL}</pre>
          <div className="hint w" style={{ marginTop: 8 }}>
            위 정책은 <b>데모용으로 누구나 읽고 쓸 수 있게</b> 열어둔 설정입니다.
            실제 운영 배포 시에는 반드시 인증된 사용자로 제한하세요.
          </div>
        </div>
      </section>
    </div>
  )
}
