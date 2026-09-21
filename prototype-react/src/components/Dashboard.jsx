import { useMemo, useState } from 'react'
import { loadLogs } from '../lib/api'

export default function Dashboard({ settings, logs, setLogs }) {
  const [error, setError] = useState('')

  const stats = useMemo(() => {
    const total = logs.length
    const ok = logs.filter((l) => l.answerable).length
    return { total, ok, no: total - ok, pct: total ? Math.round(((total - ok) / total) * 100) : 0 }
  }, [logs])

  const rows = useMemo(() => {
    const agg = {}
    logs.forEach((l) => {
      ;(l.sources || []).forEach((s) => {
        if (!agg[s]) agg[s] = { n: 0, fail: 0 }
        agg[s].n += 1
        if (!l.answerable) agg[s].fail += 1
      })
    })
    return Object.entries(agg).sort((a, b) => b[1].n - a[1].n)
  }, [logs])

  const max = rows.length ? rows[0][1].n : 1

  async function pull() {
    setError('')
    if (!settings.sbReady) {
      setError('Supabase 설정을 먼저 입력하세요 (「지식베이스 구축」 탭).')
      return
    }
    try {
      const data = await loadLogs(settings)
      setLogs(
        data.map((r) => ({
          q: r.question,
          answerable: r.answerable,
          sources: r.sources || ['(근거 문단 미발견)'],
        }))
      )
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <section className="box">
      <h2>학사팀 대시보드 <small>질문 로그 → 규정 개선 신호</small></h2>
      <div className="pad">
        <div className="stats">
          <div><div className="v">{stats.total}</div><div className="l">누적 질문</div></div>
          <div><div className="v">{stats.ok}</div><div className="l">근거 제시 답변</div></div>
          <div><div className="v">{stats.no}</div><div className="l">답변 불가<br />(부서 인계)</div></div>
          <div><div className="v">{stats.pct}%</div><div className="l">답변 불가 비율</div></div>
        </div>

        <div className="btnrow" style={{ marginBottom: 10 }}>
          <button className="btn sec" onClick={pull}>Supabase에서 로그 불러오기</button>
        </div>
        {error && <div className="hint w" style={{ marginBottom: 10 }}>{error}</div>}

        {rows.length === 0 ? (
          <div className="empty">
            아직 질문이 없습니다.
            <br />
            「학생 화면」에서 몇 가지 물어보면 이곳에 집계됩니다.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: '40%' }}>질문이 연결된 조항</th>
                <th style={{ width: '18%' }}>건수</th>
                <th>진단</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([source, v]) => (
                <tr key={source}>
                  <td>{source}</td>
                  <td>
                    <span className="bar" style={{ width: Math.max(12, (v.n / max) * 70) }} /> {v.n}
                  </td>
                  <td>
                    {v.fail / v.n >= 0.5 ? (
                      <>
                        <span className="pill r">개정 필요</span> 답변 불가 {v.fail}/{v.n}건 —{' '}
                        <b>조항 본문에 세칙 명칭·소재 또는 적용 기준 명시 필요</b>
                      </>
                    ) : (
                      <>
                        <span className="pill">양호</span> 근거 조항으로 답변 완료
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="fine">
          질문이 반복해서 몰리는 조항은 <b>학생이 몰라서가 아니라 규정이 불명확하다는 신호</b>입니다.
          이 표가 곧 개정이 필요한 조항 목록이 됩니다. 기록에는{' '}
          <b>학번·성명 등 식별 정보를 저장하지 않고</b> 질문 텍스트와 조항 식별자만 남깁니다.
        </p>
      </div>
    </section>
  )
}
