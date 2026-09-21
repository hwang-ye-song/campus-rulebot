import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSettings } from './lib/config'
import { PRESETS } from './lib/presets'
import { loadChunks } from './lib/api'
import StudentView from './components/StudentView'
import Dashboard from './components/Dashboard'
import KbBuilder from './components/KbBuilder'
import PromptEditor from './components/PromptEditor'
import HowItWorks from './components/HowItWorks'

const TABS = [
  { id: 'chat', label: '학생 화면' },
  { id: 'dash', label: '학사팀 대시보드' },
  { id: 'kb', label: '지식베이스 구축' },
  { id: 'prompt', label: '프롬프트' },
  { id: 'how', label: '동작 방식' },
]

export default function App() {
  const settings = useSettings()
  const [tab, setTab] = useState('chat')
  const [kb, setKb] = useState([])
  const [kbMode, setKbMode] = useState('로딩 중')
  const [profile, setProfile] = useState(PRESETS[2].profile)
  const [logs, setLogs] = useState([])
  const [autoAsk, setAutoAsk] = useState('')

  // 기본 지식베이스 (학칙 + 수강신청 안내문)
  useEffect(() => {
    let cancelled = false
    fetch('kb.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('no kb.json'))))
      .then((data) => {
        if (cancelled) return
        setKb(data)
        setKbMode('기본 내장 · 텍스트 검색')
      })
      .catch(() => {
        // kb.json 을 동봉하지 않은 배포에서는 Supabase 에 저장된 지식베이스를 씁니다.
        if (cancelled) return
        setKbMode('Supabase 에서 불러오는 중')
        loadChunks(settings)
          .then((rows) => {
            if (cancelled || !rows.length) return
            setKb(rows)
            setKbMode('Supabase · 벡터 검색')
          })
          .catch(() => !cancelled && setKbMode('지식베이스 없음 — 「지식베이스 구축」 탭에서 문서를 올려주세요'))
      })
    return () => { cancelled = true }
  }, [])

  // URL 파라미터로 화면 상태 지정 (문서용 캡처에 사용)
  useEffect(() => {
    const u = new URLSearchParams(window.location.search)
    const next = {}
    if (u.get('camp')) next.campus = u.get('camp')
    if (u.get('year')) next.grade = Number(u.get('year'))
    if (u.get('cohort')) next.cohort = u.get('cohort')
    if (u.get('major')) next.majorType = u.get('major')
    if (u.get('vol') === '1') next.volunteer = true
    if (u.get('rotc') === '1') next.rotc = true
    if (Object.keys(next).length) setProfile((p) => ({ ...p, ...next }))
    if (u.get('tab')) setTab(u.get('tab'))
    if (u.get('edge') === '1') settings.toggleEdge(true)

    // ?kb=supabase — 저장된 벡터 지식베이스를 불러와 벡터 검색으로 시작합니다.
    // ?ask=... 는 지식베이스가 확정된 뒤에 넘겨야 검색이 올바른 대상에서 일어납니다.
    const question = u.get('ask') || ''
    if (u.get('kb') === 'supabase') {
      loadChunks(settings)
        .then((rows) => {
          if (rows.length) { setKb(rows); setKbMode('Supabase · 벡터 검색') }
          if (question) setAutoAsk(question)
        })
        .catch(() => { setKbMode('Supabase 불러오기 실패'); if (question) setAutoAsk(question) })
    } else if (question) {
      setAutoAsk(question)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const replaceKb = useCallback((chunks, mode) => {
    setKb(chunks)
    setKbMode(mode)
  }, [])

  const addLog = useCallback((entry) => setLogs((prev) => [...prev, entry]), [])

  const hasVectors = useMemo(() => kb.length > 0 && Array.isArray(kb[0]?.embedding), [kb])

  return (
    <div className="app">
      <header className="hd">
        <h1>새벽 3시의 <span>학사팀</span></h1>
        <div className="sub">학칙을 근거로만 답하는 ERICA 학사 상담 AI</div>
        <div className="kbinfo">
          지식베이스 <b>{kb.length}</b>개 조각 · {hasVectors ? '벡터 검색' : kbMode}
        </div>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'on' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'chat' && (
        <StudentView
          settings={settings}
          kb={kb}
          profile={profile}
          setProfile={setProfile}
          onLog={addLog}
          logCount={logs.length}
          autoAsk={autoAsk}
        />
      )}
      {tab === 'dash' && <Dashboard settings={settings} logs={logs} setLogs={setLogs} />}
      {tab === 'kb' && <KbBuilder settings={settings} onReplaceKb={replaceKb} />}
      {tab === 'prompt' && <PromptEditor settings={settings} />}
      {tab === 'how' && <HowItWorks kbCount={kb.length} />}
    </div>
  )
}
