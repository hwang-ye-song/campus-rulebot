import { OFFICE } from '../lib/config'

/** 줄바꿈을 문단으로 — 모델 출력은 텍스트로만 렌더링합니다(HTML 주입 없음). */
function Paragraphs({ text }) {
  return (
    <>
      {String(text || '')
        .split(/\n+/)
        .filter(Boolean)
        .map((line, i) => (
          <p key={i}>{line}</p>
        ))}
    </>
  )
}

export function Sources({ title, chunks, withQuote = false }) {
  if (!chunks?.length) return null
  return (
    <div className="src">
      <b>{title}</b>
      {chunks.map((c, i) => (
        <div key={i}>
          · {c.source}
          {withQuote && <span className="quote">{c.text.slice(0, 150)}…</span>}
        </div>
      ))}
    </div>
  )
}

export function Escalation({ reason, onCall, onTicket }) {
  return (
    <div className="esc">
      {reason}
      <div style={{ marginTop: 7 }}>
        📞 <b>{OFFICE.name}</b> · {OFFICE.tel}
        <br />
        <span style={{ opacity: 0.85 }}>{OFFICE.hours}</span>
      </div>
      <div className="btns">
        <button onClick={onCall}>전화 안내 보기</button>
        <button onClick={onTicket}>1:1 문의 남기기</button>
      </div>
    </div>
  )
}

export default function Message({ msg, onCall, onTicket }) {
  if (msg.role === 'me') {
    return (
      <div className="msg me">
        <div className="bub">{msg.text}</div>
      </div>
    )
  }

  if (msg.typing) {
    return (
      <div className="msg ai">
        <div className="bub typing"><i /><i /><i /></div>
      </div>
    )
  }

  return (
    <div className="msg ai">
      <div className="bub">
        <Paragraphs text={msg.text} />
        {msg.sources && (
          <Sources title={msg.sourcesTitle} chunks={msg.sources} withQuote={msg.withQuote} />
        )}
        {msg.escalate && (
          <Escalation reason={msg.escalate} onCall={onCall} onTicket={onTicket} />
        )}
        {msg.caution && <div className="note">⚠️ {msg.caution}</div>}
        {msg.unverified && (
          <div className="esc">
            ⚠️ 모델이 근거 조항을 특정하지 못했습니다. 이 답변은 확인이 필요합니다.
            <div className="btns">
              <button onClick={onTicket}>1:1 문의로 확인 요청</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
