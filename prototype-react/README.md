# 한양 챗봇

학칙을 근거로만 답하는 ERICA 학사 상담 AI — 2026 AI 활용 학사제도 개선 아이디어 공모전 프로토타입.

행정실이 닫힌 시간에 생기는 학사 질문에, **학칙 원문에서 찾은 근거로만** 답합니다.
근거가 없으면 답을 지어내지 않고 담당 부서 전화 안내와 1:1 문의로 넘깁니다.
그리고 답하지 못한 기록을 모아 **어느 조항을 개정해야 하는지** 알려줍니다.

## 무엇이 들어 있나

| 화면 | 하는 일 |
|---|---|
| 학생 화면 | 학적 조건을 반영한 상담. 답변마다 근거 조항 표시 |
| 학사팀 대시보드 | 질문 로그 집계 → 모호 조항 진단표 |
| 지식베이스 구축 | PDF/TXT 업로드 → 조문 단위 분할 → 임베딩 → Supabase 저장 |
| 프롬프트 | 시스템 프롬프트를 직접 수정하며 환각 억제 효과를 비교 |
| 동작 방식 | 7단계 파이프라인 설명과 한계 고지 |

기본 지식베이스(`public/kb.json`)는 **261개 조각**입니다.

- 한양대학교 학칙(2024.10.31. 개정) — 228개 조문
- 2026학년도 2학기 ERICA 수강신청 안내문 — 33개 조각

## 실행

```bash
npm install
npm run dev
```

빌드는 `npm run build`, 결과물은 `dist/`에 생깁니다.

## 모델 호출 방식 두 가지

### 1. 직접 호출 (시연용)

「지식베이스 구축 → 모델 호출 설정」에서 Edge Function 경유를 끄고 OpenAI API 키를 입력합니다.
키는 **이 브라우저의 localStorage에만** 저장되며 코드에 포함되지 않습니다.
발표장에서 빠르게 보여줄 때 쓰기 좋지만, **공개 배포에는 쓰지 마세요.**

### 2. Edge Function 경유 (배포용, 권장)

브라우저는 Supabase Edge Function만 호출하고, OpenAI 키는 서버 시크릿에만 존재합니다.

```bash
supabase functions deploy ask --no-verify-jwt
supabase secrets set OPENAI_API_KEY=sk-...
```

앱은 **Edge Function 경유가 기본값으로 켜져 있어** 처음 접속한 사람도 설정 없이 바로 질문할 수 있습니다.

> 대시보드에서 함수를 만들 때는 **Verify JWT 옵션을 꺼야** 합니다. 켜져 있으면 401이 납니다.

## Supabase 준비

SQL Editor에서 [`supabase/schema.sql`](supabase/schema.sql)을 실행하세요.
`kb_chunk`(지식베이스), `question_log`(질문 로그), `ambiguous_article`(모호 조항 집계 뷰)이 생깁니다.

질문 로그에는 **학번·성명을 저장하지 않습니다.** 질문 텍스트, 캠퍼스, 학년, 답변 가능 여부,
연결된 조항만 남습니다.

> ⚠️ `schema.sql`의 정책은 **지식베이스 업로드용으로 쓰기가 열린 상태**입니다.
> 업로드를 마친 뒤에는 아래처럼 읽기 전용으로 조이세요. 현재 배포본은 이 상태입니다.
>
> ```sql
> drop policy if exists "kb public"  on kb_chunk;
> drop policy if exists "log public" on question_log;
> create policy "kb read"    on kb_chunk     for select using (true);
> create policy "log insert" on question_log for insert with check (true);
> create policy "log read"   on question_log for select using (true);
> ```
>
> 운영 시에는 로그인 기반으로 관리자와 학생 권한을 분리해야 합니다.

## Vercel 배포

`vercel.json`이 포함되어 있어 저장소를 연결하면 그대로 빌드됩니다.
API 키를 환경변수로 넣을 필요가 없습니다 — Edge Function 경유 방식을 쓰기 때문입니다.

## URL 파라미터

문서용 화면 캡처에 쓰는 파라미터입니다. 실제 검색·생성 경로를 그대로 타므로 화면 내용은 실제 동작 결과입니다.

| 파라미터 | 예시 |
|---|---|
| `tab` | `kb`, `prompt`, `dash`, `how` |
| `year` | `1` ~ `4` |
| `cohort` | `25이하`, `26이후` |
| `major` | `단일전공`, `다중전공 · 복수전공` |
| `vol`, `rotc` | `1` |

## 설계상 지키는 것

1. **근거 없으면 답하지 않는다** — 검색 결과가 없거나 모델이 `answerable: false`를 반환하면 답변을 표시하지 않습니다.
2. **답변에 조항을 붙인다** — 모델이 인용한 조항 번호가 실제로 전달한 조문에 있는지 대조한 뒤에만 근거로 표시합니다.
3. **학적으로 답을 확정한다** — 같은 질문도 학번·학년·전공 유형에 따라 답이 갈립니다.

## 한계

근거 기반 설계로도 오답 가능성은 0이 되지 않습니다.
이 시스템의 답변은 **안내이며 최종 유권해석이 아닙니다.**
학적변동·졸업사정처럼 되돌릴 수 없는 사안은 담당 부서 확인을 거치도록 설계했습니다.
