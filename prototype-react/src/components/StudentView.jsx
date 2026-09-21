import { useCallback, useEffect, useRef, useState } from 'react'
import { OFFICE, profileLines } from '../lib/config'
import { CUSTOM_ID, PRESETS } from '../lib/presets'
import { chat, logQuestion } from '../lib/api'
import { retrieve } from '../lib/rag'
import Message from './Message'

const EXAMPLES = [
  { q: '1학년인데 휴학할 수 있나요?' },
  { q: '복수전공은 몇 학점을 이수해야 하나요?' },
  { q: '23학점 들을 수 있나요?', tag: '조건 바꿔가며 비교' },
  { q: '3학년 다전공인데 타 학과 전공과목은 언제 신청할 수 있나요?', tag: '신청 일정' },
  { q: '정정기간에도 이 수업 신청할 수 있나요?', tag: '시점에 따라 달라짐' },
  { q: '제 경우에 지금 휴학하면 불이익이 있을까요?' },
]

const GREETING = `안녕하세요. ERICA 학사 상담 AI입니다.
행정실이 닫힌 시간에도 답해 드립니다. 다만 세 가지를 지킵니다.
① 학칙 원문에 근거가 있을 때만 답합니다
② 모든 답변에 근거 조항을 함께 보여드립니다
③ 근거가 없으면 지어내지 않고 담당 부서로 연결합니다

오른쪽에서 학적 조건을 먼저 확인해 주세요. 같은 질문이라도 조건에 따라 답이 다릅니다.`

function clock() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function StudentView({ settings, kb, profile, setProfile, onLog, logCount, autoAsk }) {
  const [messages, setMessages] = useState([{ role: 'ai', text: GREETING }])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(clock())
  const chatRef = useRef(null)
  const askedRef = useRef(false)
  const [presetId, setPresetId] = useState(PRESETS[2].id)

  useEffect(() => {
    const t = setInterval(() => setNow(clock()), 20000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [messages])

  const push = useCallback((msg) => setMessages((prev) => [...prev, msg]), [])
  const set = (patch) => setProfile((p) => ({ ...p, ...patch }))

  const onCall = useCallback(() => {
    const h = new Date().getHours()
    const open = h >= 9 && h < 18
    push({
      role: 'ai',
      text: open
        ? `지금은 운영시간입니다. ${OFFICE.tel} 로 전화하시면 바로 상담받으실 수 있습니다.`
        : `지금은 운영시간이 아닙니다.\n${OFFICE.name} · ${OFFICE.tel}\n다음 응대 가능 시각은 평일 오전 9시입니다.\n기다리기 어려우시면 「1:1 문의 남기기」로 지금 남겨두세요. 운영시간이 시작되면 순서대로 답변됩니다.`,
    })
  }, [push])

  const onTicket = useCallback(() => {
    push({
      role: 'ai',
      text: '1:1 문의가 접수되었습니다.\n대화 내용과 아래 조건이 자동으로 정리되어 담당자에게 전달됩니다. 상황을 다시 설명하실 필요가 없습니다.',
      sourcesTitle: '첨부된 내 조건',
      sources: [
        { source: `${profileLines(profile).replace(/\n/g, ' · ')} · 질문 내역 ${logCount}건`, text: '' },
      ],
    })
  }, [push, profile, logCount])

  const ask = useCallback(
    async (raw) => {
      const q = String(raw || '').trim()
      if (!q || busy) return
      setInput('')
      setBusy(true)
      push({ role: 'me', text: q })
      push({ role: 'ai', typing: true })

      const dropTyping = () => setMessages((prev) => prev.filter((m) => !m.typing))

      try {
        const ctx = await retrieve(kb, q, settings, 6)

        if (!ctx.length) {
          dropTyping()
          push({
            role: 'ai',
            text: '학칙과 학사 안내문에서 이 질문에 해당하는 근거 문단을 찾지 못했습니다. 근거 없이 답을 지어내지 않는 것이 이 시스템의 원칙입니다.',
            escalate: '⚠️ 답변을 생성하지 않았습니다. 담당 부서로 연결해 드리겠습니다.',
          })
          onLog({ q, answerable: false, sources: ['(근거 문단 미발견)'] })
          logQuestion(settings, {
            question: q, campus: profile.campus, grade: profile.grade,
            answerable: false, sources: ['(근거 문단 미발견)'],
          })
          return
        }

        if (!settings.canCall) {
          dropTyping()
          push({
            role: 'ai',
            text: 'API 키가 입력되지 않았습니다. 오른쪽 「설정」에 OpenAI API 키를 넣거나 Edge Function 경유를 켜 주세요.',
            sourcesTitle: '참고 — 이 질문으로 검색된 근거 조문',
            sources: ctx,
          })
          return
        }

        const user = `<학생 조건>\n${profileLines(profile)}\n\n<규정>\n${ctx
          .map((c) => `[${c.id}] ${c.source}\n${c.text}`)
          .join('\n\n')}\n\n<질문>\n${q}`

        const res = await chat(settings, settings.prompt, user)
        dropTyping()

        // 모델이 인용한 조항이 실제로 전달한 조문에 있는지 대조
        const ids = ctx.map((c) => c.id)
        const used = (res.used || []).filter((u) =>
          ids.some((i) => i === u || i.includes(u) || u.includes(i))
        )
        const cited = ctx.filter((c) =>
          used.some((u) => c.id === u || c.id.includes(u) || u.includes(c.id))
        )
        const sources = cited.map((c) => c.source)

        if (res.answerable === false) {
          push({
            role: 'ai',
            text: res.answer || '이 질문은 학칙만으로 답변드릴 수 없습니다.',
            sourcesTitle: '확인한 근거 (여기에 답이 없었습니다)',
            sources: cited.length ? cited : null,
            escalate: `⚠️ ${res.reason || '근거가 없어 답변을 생성하지 않았습니다.'} 추측으로 답하지 않습니다.`,
          })
          onLog({ q, answerable: false, sources: sources.length ? sources : ['(근거 문단 미발견)'] })
          logQuestion(settings, {
            question: q, campus: profile.campus, grade: profile.grade,
            answerable: false, sources: sources.length ? sources : ['(근거 문단 미발견)'],
          })
        } else {
          push({
            role: 'ai',
            text: res.answer,
            sourcesTitle: '근거',
            sources: cited.length ? cited : null,
            withQuote: true,
            unverified: cited.length === 0,
            caution: res.caution || null,
          })
          onLog({ q, answerable: cited.length > 0, sources: sources.length ? sources : ['(근거 문단 미발견)'] })
          logQuestion(settings, {
            question: q, campus: profile.campus, grade: profile.grade,
            answerable: cited.length > 0, sources,
          })
        }
      } catch (err) {
        dropTyping()
        push({
          role: 'ai',
          text: `요청을 처리하지 못했습니다.\n${err.message}`,
          caution: '키가 올바른지, 모델명이 사용 가능한지 확인해 주세요. 잔액이 없거나 모델 접근 권한이 없어도 같은 오류가 납니다.',
        })
      } finally {
        setBusy(false)
      }
    },
    [busy, kb, settings, profile, push, onLog]
  )

  // ?ask=... — 지식베이스가 준비되면 한 번만 자동 질문 (문서용 화면 캡처)
  // 정리 함수로 취소하지 않습니다. 지식베이스가 교체되며 effect 가 다시 돌 때
  // 예약된 질문이 취소되어 영영 실행되지 않는 문제가 있었습니다.
  useEffect(() => {
    if (!autoAsk || askedRef.current || !kb.length) return
    askedRef.current = true
    ask(autoAsk)
  }, [autoAsk, kb.length, ask])

  return (
    <div className="wrap">
      <section className="box" style={{ marginBottom: 0 }}>
        <h2>ERICA 학사 상담 <small>{now}</small></h2>
        <div className="chat" ref={chatRef}>
          {messages.map((m, i) => (
            <Message key={i} msg={m} onCall={onCall} onTicket={onTicket} />
          ))}
        </div>
        <div className="inp">
          <input
            value={input}
            placeholder="궁금한 것을 물어보세요 (예: 1학년인데 휴학 되나요?)"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && ask(input)}
          />
          <button onClick={() => ask(input)} disabled={busy}>전송</button>
        </div>
      </section>

      <div>
        <section className="box">
          <h2>내 학적 정보 <small>프리셋을 바꾸면 같은 질문의 답이 갈립니다</small></h2>
          <div className="pad">
            <div className="presets">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  className={presetId === p.id ? 'on' : ''}
                  onClick={() => { setPresetId(p.id); setProfile(p.profile) }}
                >
                  <b>{p.name}</b>
                  <span className="d">{p.desc}</span>
                  <span className="h">{p.highlight}</span>
                </button>
              ))}
              <button
                className={presetId === CUSTOM_ID ? 'on' : ''}
                onClick={() => setPresetId(CUSTOM_ID)}
              >
                <b>직접 설정</b>
                <span className="d">조건을 하나씩 지정합니다</span>
              </button>
            </div>

            {presetId === CUSTOM_ID && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
                <div className="row">
                  <label>캠퍼스</label>
                  <select value={profile.campus} onChange={(e) => set({ campus: e.target.value })}>
                    <option>ERICA캠퍼스</option>
                    <option>서울캠퍼스</option>
                  </select>
                </div>
                <div className="row">
                  <label>학년</label>
                  <select value={profile.grade} onChange={(e) => set({ grade: Number(e.target.value) })}>
                    {[1, 2, 3, 4].map((g) => <option key={g} value={g}>{g}학년</option>)}
                  </select>
                </div>
                <div className="row">
                  <label>입학</label>
                  <select value={profile.cohort} onChange={(e) => set({ cohort: e.target.value })}>
                    <option value="25이하">25학번 이하</option>
                    <option value="26이후">26학번 이후</option>
                  </select>
                </div>
                <div className="row">
                  <label>전공</label>
                  <select value={profile.majorType} onChange={(e) => set({ majorType: e.target.value })}>
                    <option>단일전공</option>
                    <option>다중전공 · 복수전공</option>
                    <option>부전공</option>
                  </select>
                </div>
                <div className="row">
                  <label>추가신청</label>
                  <div className="checks">
                    <label>
                      <input type="checkbox" checked={profile.volunteer}
                        onChange={(e) => set({ volunteer: e.target.checked })} /> 사회봉사
                    </label>
                    <label>
                      <input type="checkbox" checked={profile.rotc}
                        onChange={(e) => set({ rotc: e.target.checked })} /> ROTC 필수
                    </label>
                    <label>
                      <input type="checkbox" checked={profile.graduating}
                        onChange={(e) => set({ graduating: e.target.checked })} /> 졸업예정학기
                    </label>
                  </div>
                </div>
              </div>
            )}

            <div className="hint" style={{ marginTop: 9 }}>
              {profile.campus} · {profile.grade}학년 · {profile.cohort} 학번 · {profile.majorType}
              {' · '}{profile.grade <= 2 ? '25-28' : '20-23'} 교육과정
            </div>
            <div className="hint n" style={{ marginTop: 6 }}>
              <b>시연용 프리셋입니다.</b> 실제 운영 시에는 로그인과 동시에
              <b> 학사정보시스템과 수강신청 시스템에서 자동으로 불러옵니다.</b>
              학생이 자기 조건을 고르는 화면 자체가 없습니다.
            </div>
          </div>

          <div className="pad examples" style={{ borderTop: '1px solid var(--line)' }}>
            <p>눌러서 바로 질문해 보세요</p>
            {EXAMPLES.map((ex) => (
              <button key={ex.q} onClick={() => ask(ex.q)}>
                {ex.q} {ex.tag && <span className="tag">({ex.tag})</span>}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
