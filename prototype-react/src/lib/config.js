import { useCallback, useEffect, useState } from 'react'

/** Supabase 기본값 — publishable 키는 클라이언트 공개를 전제로 한 키입니다. */
export const DEFAULT_SB_URL = 'https://rtkirzxoxeevxjxzlhul.supabase.co'
export const DEFAULT_SB_KEY = 'sb_publishable_qEv1k4Nq6L6MBB57x5Wo3g_mUcri3eF'

export const OFFICE = {
  name: 'ERICA 학사운영팀',
  tel: '031-400-4231',
  hours: '평일 09:00 – 17:30 (점심 12:00 – 13:00 · 주말·공휴일 휴무)',
}

/**
 * 지금 학사운영팀이 전화를 받는 시간인지와, 아니라면 다음 응대 가능 시각.
 * 평일 09:00–12:00, 13:00–17:30. 공휴일은 판별하지 않습니다.
 */
export function officeStatus(now = new Date()) {
  const day = now.getDay()               // 0=일, 6=토
  const m = now.getHours() * 60 + now.getMinutes()
  const weekday = day >= 1 && day <= 5
  if (weekday && ((m >= 540 && m < 720) || (m >= 780 && m < 1050))) return { open: true }
  if (weekday && m >= 720 && m < 780) return { open: false, next: '오늘 오후 1시 (점심시간)' }
  if (weekday && m < 540) return { open: false, next: '오늘 오전 9시' }
  // 평일 17:30 이후 또는 주말 → 다음 평일 09:00
  const nextDay = day === 5 || day === 6 ? '월요일' : day === 0 ? '내일(월)' : '내일'
  return { open: false, next: `${nextDay} 오전 9시` }
}

export const MODELS = [
  { id: 'gpt-5.6-luna', label: 'gpt-5.6-luna (저비용 · $0.20/$1.20 per 1M)' },
  { id: 'gpt-5.6-sol', label: 'gpt-5.6-sol' },
  { id: 'gpt-5.6-terra', label: 'gpt-5.6-terra' },
  { id: 'gpt-4.1-nano', label: 'gpt-4.1-nano' },
  { id: 'gpt-4o-mini', label: 'gpt-4o-mini' },
]

export const DEFAULT_PROMPT = `당신은 한양대학교 ERICA캠퍼스 학사 상담 AI입니다. 학생에게 한국어 존댓말로 답합니다.

절대 규칙:
1. 아래 <규정>에 제시된 원문에 근거가 있는 내용만 답하십시오. 원문에 없는 수치·기한·절차를 지어내지 마십시오.
2. 일반 상식이나 다른 대학의 관례로 보충하지 마십시오.
3. 규정에 답이 없거나, 개별 학생의 학적 기록을 확인해야 판단할 수 있는 질문이면 answerable을 false로 하십시오.
4. 규정이 "세부사항은 따로 정한다", "별도로 정한다"처럼 다른 규정으로 위임하고 있어 실질 내용을 알 수 없으면 answerable을 false로 하고, reason에 "학칙이 세칙으로 위임하고 있어 학칙만으로는 확인 불가"라고 쓰십시오.
5. 캠퍼스나 학년에 따라 적용이 갈리는 조항이면, 학생의 조건에 해당하는 내용을 먼저 말하고 다른 조건은 주의사항으로 덧붙이십시오.
6. 조항에 단서("다만, …")나 예외가 있으면 반드시 함께 알리십시오.
7. <학생 조건>에 주어진 학년·입학 구분·전공 유형·추가 신청 사항을 모두 반영해 계산하십시오. 특히 수강 가능 학점처럼 조건에 따라 값이 달라지는 질문은, 그 학생에게 적용되는 값을 먼저 확정해 말하고, 다른 조건이었다면 달라졌을 부분을 caution에 적으십시오.

반드시 아래 JSON 형식으로만 응답하십시오:
{"answerable": true/false, "answer": "학생에게 보여줄 답변", "used": ["제24조", "제25조"], "caution": "단서·예외·주의사항 (없으면 빈 문자열)", "reason": "answerable이 false일 때만, 답할 수 없는 이유"}`

const read = (k, fallback = '') => {
  try {
    const v = localStorage.getItem(k)
    return v === null ? fallback : v
  } catch {
    return fallback
  }
}

/** localStorage에 동기화되는 상태. 비공개 모드 등에서 실패해도 앱이 죽지 않습니다. */
export function usePersistentState(key, fallback = '') {
  const [value, setValue] = useState(() => read(key, fallback))
  useEffect(() => {
    try {
      localStorage.setItem(key, value)
    } catch {
      /* 저장 불가 환경 — 메모리 상태로만 동작 */
    }
  }, [key, value])
  return [value, setValue]
}

/** 학생 학적 조건 */
export const EMPTY_PROFILE = {
  campus: 'ERICA캠퍼스',
  grade: 3,
  cohort: '25이하',
  majorType: '단일전공',
  volunteer: false,
  rotc: false,
  graduating: false,
}

export function profileLines(p) {
  const extra = []
  if (p.volunteer) extra.push('사회봉사 신청')
  if (p.rotc) extra.push('ROTC 필수 교과목 신청')
  if (p.graduating) extra.push('졸업예정학기')
  return [
    `캠퍼스: ${p.campus}`,
    `학년: ${p.grade}학년`,
    `입학 구분: ${p.cohort} 학번`,
    `전공 유형: ${p.majorType}`,
    `추가 신청 사항: ${extra.length ? extra.join(', ') : '없음'}`,
    `적용 교육과정: ${p.grade <= 2 ? '25-28 교육과정' : '20-23 교육과정'}`,
  ].join('\n')
}

export function useSettings() {
  const [apiKey, setApiKey] = usePersistentState('oa_key', '')
  const [model, setModel] = usePersistentState('oa_model', MODELS[0].id)
  const [embModel, setEmbModel] = usePersistentState('emb_model', 'text-embedding-3-small')
  // 배포 시연에서는 Edge Function 경유를 기본값으로 켭니다.
  // 처음 접속한 사람이 아무 설정 없이 바로 질문할 수 있어야 하고,
  // 이 경로는 OpenAI 키가 서버 시크릿에만 있어 노출 위험도 없습니다.
  const [useEdge, setUseEdge] = usePersistentState('use_edge', '1')
  const [sbUrl, setSbUrl] = usePersistentState('sb_url', DEFAULT_SB_URL)
  const [sbKey, setSbKey] = usePersistentState('sb_key', DEFAULT_SB_KEY)
  const [prompt, setPrompt] = usePersistentState('sys_prompt', DEFAULT_PROMPT)

  const sbReady = Boolean(sbUrl.trim() && sbKey.trim())
  const edgeOn = useEdge === '1' && sbReady

  const toggleEdge = useCallback((on) => setUseEdge(on ? '1' : '0'), [setUseEdge])

  return {
    apiKey: apiKey.trim(), setApiKey,
    model, setModel,
    embModel, setEmbModel,
    edgeOn, toggleEdge, rawEdge: useEdge === '1',
    sbUrl: sbUrl.trim(), setSbUrl,
    sbKey: sbKey.trim(), setSbKey,
    sbReady,
    prompt, setPrompt,
    /** LLM 호출이 가능한 상태인가 */
    canCall: Boolean(apiKey.trim()) || edgeOn,
  }
}
