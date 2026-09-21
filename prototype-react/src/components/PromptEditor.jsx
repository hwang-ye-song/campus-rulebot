import { useState } from 'react'
import { DEFAULT_PROMPT } from '../lib/config'

export default function PromptEditor({ settings }) {
  const [saved, setSaved] = useState(false)

  return (
    <section className="box">
      <h2>시스템 프롬프트 <small>AI가 지켜야 할 규칙</small></h2>
      <div className="pad">
        <p className="fine" style={{ margin: '0 0 9px' }}>
          이 프롬프트가 <b>"근거 없으면 답하지 않는다"는 원칙을 실제로 강제하는 장치</b>입니다.
          수정하면 즉시 반영되며 이 브라우저에 저장됩니다.
        </p>

        <textarea
          rows={22}
          value={settings.prompt}
          onChange={(e) => { settings.setPrompt(e.target.value); setSaved(false) }}
        />

        <div className="btnrow">
          <button className="btn" onClick={() => setSaved(true)}>저장됨 표시</button>
          <button
            className="btn sec"
            onClick={() => { settings.setPrompt(DEFAULT_PROMPT); setSaved(false) }}
          >
            기본값으로 되돌리기
          </button>
          {saved && <span className="hint g" style={{ flex: 1 }}>저장되었습니다. 다음 질문부터 적용됩니다.</span>}
        </div>

        <div className="hint" style={{ marginTop: 11 }}>
          <b>실험해 보세요.</b> 1번 규칙("근거가 있는 내용만 답하라")을 지우고 같은 질문을 던지면,
          모델이 <b>다른 대학의 관례나 그럴듯한 추측으로 답하기 시작합니다.</b> 이 차이가 곧 제안서에서
          말한 환각 문제이며, 프롬프트가 그것을 어떻게 억제하는지 보여주는 시연이 됩니다.
        </div>
      </div>
    </section>
  )
}
