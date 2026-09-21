/**
 * 시연용 학적 프리셋.
 *
 * 네 가지 축(캠퍼스 · 입학 학번 · 전공 유형 · 추가 신청 사항)이 각각 하나씩 걸리도록
 * 골랐습니다. 같은 질문을 던지고 프리셋만 바꾸면 답이 갈리는 것을 바로 볼 수 있습니다.
 *
 * 실제 운영 시에는 로그인과 동시에 학사정보시스템에서 불러오므로,
 * 학생이 조건을 고르는 화면 자체가 없습니다.
 */
export const PRESETS = [
  {
    id: 'erica-freshman',
    name: 'ERICA 신입생',
    desc: '26학번 · 1학년 · 단일전공',
    axis: '캠퍼스',
    highlight: '휴학 — ERICA는 첫 번째·두 번째 학기 모두 불가',
    tryQ: '1학년인데 휴학할 수 있나요?',
    profile: {
      campus: 'ERICA캠퍼스', grade: 1, cohort: '26이후',
      majorType: '단일전공', volunteer: false, rotc: false, graduating: false,
    },
  },
  {
    id: 'seoul-freshman',
    name: '서울캠 신입생',
    desc: '26학번 · 1학년 · 단일전공',
    axis: '캠퍼스',
    highlight: '같은 질문 — 서울캠은 첫 번째 학기만 제한',
    tryQ: '1학년인데 휴학할 수 있나요?',
    profile: {
      campus: '서울캠퍼스', grade: 1, cohort: '26이후',
      majorType: '단일전공', volunteer: false, rotc: false, graduating: false,
    },
  },
  {
    id: 'multi-major',
    name: '다중전공 3학년',
    desc: '25학번 · 3학년 · 다중전공',
    axis: '전공 유형',
    highlight: '수강학점 — 타 학과 전공 수강 시 23학점까지',
    tryQ: '23학점 들을 수 있나요?',
    profile: {
      campus: 'ERICA캠퍼스', grade: 3, cohort: '25이하',
      majorType: '다중전공 · 복수전공', volunteer: false, rotc: false, graduating: false,
    },
  },
  {
    id: 'senior-26',
    name: '26학번 3학년',
    desc: '26학번 · 3학년 · 단일전공',
    axis: '입학 학번',
    highlight: '같은 3학년인데 상한이 18학점으로 더 낮음',
    tryQ: '23학점 들을 수 있나요?',
    profile: {
      campus: 'ERICA캠퍼스', grade: 3, cohort: '26이후',
      majorType: '단일전공', volunteer: false, rotc: false, graduating: false,
    },
  },
  {
    id: 'graduating',
    name: '졸업예정 4학년',
    desc: '25학번 · 4학년 · 졸업예정학기 · 사회봉사',
    axis: '추가 신청',
    highlight: '최소학점이 3학점으로 내려가고 사회봉사 1학점이 더해짐',
    tryQ: '최소 몇 학점을 들어야 하나요?',
    profile: {
      campus: 'ERICA캠퍼스', grade: 4, cohort: '25이하',
      majorType: '단일전공', volunteer: true, rotc: false, graduating: true,
    },
  },
]

export const CUSTOM_ID = 'custom'
