const STEPS = [
  ['1. 수집', '학칙 PDF를 브라우저에서 직접 파싱해 텍스트를 추출합니다. 별도 서버가 필요 없습니다.'],
  ['2. 분할', '제○조 단위로 잘라 조문 하나가 검색 단위가 되게 합니다. 답변에 조항 번호를 붙이기 위한 전제입니다.'],
  ['3. 임베딩', 'text-embedding-3-small로 벡터화해 Supabase에 저장합니다. 한 번 만들어 두면 재생성이 필요 없습니다.'],
  ['4. 검색', '질문도 같은 방식으로 벡터화한 뒤 코사인 유사도로 관련 조문 상위 6개를 고릅니다. 임베딩이 없으면 글자 단위 부분 일치 검색으로 대체 동작합니다.'],
  ['5. 생성', '선택된 조문 원문만 모델에 전달하고, 그 안에 없는 내용은 말하지 말 것과 사용한 조문 번호를 밝힐 것을 지시합니다. 학생의 학적 조건도 함께 전달해 적용 값을 확정합니다.'],
  ['6. 검증', 'answerable이 false면 답변을 표시하지 않고 전화 안내와 1:1 문의로 인계합니다. 모델이 인용한 조문 번호가 실제 전달한 조문에 있는지도 대조합니다.'],
  ['7. 환류', '질문과 연결 조항, 답변 가능 여부를 저장해 모호 조항 진단표로 집계합니다.'],
]

export default function HowItWorks({ kbCount }) {
  return (
    <section className="box">
      <h2>동작 방식 <small>이 프로토타입이 실제로 하는 일</small></h2>
      <div className="pad">
        <p className="fine" style={{ margin: '0 0 10px' }}>
          현재 지식베이스는 <b>{kbCount}개 조각</b>입니다 — 한양대학교 학칙(2024.10.31. 개정)과
          2026학년도 2학기 ERICA 수강신청 안내문 전문.
        </p>

        <table>
          <thead>
            <tr><th style={{ width: '16%' }}>단계</th><th>내용</th></tr>
          </thead>
          <tbody>
            {STEPS.map(([k, v]) => (
              <tr key={k}><td><b>{k}</b></td><td>{v}</td></tr>
            ))}
          </tbody>
        </table>

        <div className="hint w" style={{ marginTop: 12 }}>
          <b>한계를 분명히 밝힙니다.</b> 근거 기반 설계로도 오답 가능성은 0이 되지 않습니다.
          이 시스템의 답변은 <b>안내이며 최종 유권해석이 아닙니다.</b> 학적변동·졸업사정처럼
          되돌릴 수 없는 사안은 반드시 담당 부서 확인을 거치도록 설계했습니다.
        </div>

        <div className="hint" style={{ marginTop: 9 }}>
          <b>배포.</b> Vite로 빌드한 정적 결과물이라 Vercel에 그대로 올라갑니다.
          API 키는 코드에 포함되지 않으며, <b>Edge Function 경유</b>를 켜면 키가 서버 시크릿에만
          존재하고 브라우저에는 전달되지 않습니다.
        </div>
      </div>
    </section>
  )
}
