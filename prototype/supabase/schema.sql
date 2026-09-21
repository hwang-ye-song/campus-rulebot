-- ============================================================
--  새벽 3시의 학사팀 — Supabase 스키마
--  Supabase 대시보드 > SQL Editor 에 붙여넣고 RUN 하세요.
-- ============================================================

-- ── 1. 지식베이스 조각 (학칙 조문 + 임베딩) ──────────────────
create table if not exists kb_chunk (
  id         bigserial primary key,
  created_at timestamptz default now(),
  doc_name   text not null,          -- 예: 한양대학교 학칙(2024.10.31. 개정)
  chunk_id   text,                   -- 예: 제24조
  title      text,                   -- 예: 휴학
  source     text not null,          -- 답변에 표시할 출처 문자열
  content    text not null,          -- 조문 원문
  embedding  jsonb                   -- 임베딩 벡터 (float 배열)
);

create index if not exists kb_chunk_doc_idx on kb_chunk (doc_name);

-- ── 2. 질문 로그 (환류 루프의 원천 데이터) ────────────────────
--    개인 식별 정보는 저장하지 않습니다. 학번·성명 컬럼이 없습니다.
create table if not exists question_log (
  id         bigserial primary key,
  created_at timestamptz default now(),
  question   text not null,
  campus     text,
  grade      int,
  answerable boolean,                -- false = 근거 없어 답변 거부 → 규정 개선 신호
  sources    text[]                  -- 검색된 근거 조항들
);

create index if not exists question_log_created_idx on question_log (created_at desc);

-- ── 3. RLS ──────────────────────────────────────────────────
alter table kb_chunk     enable row level security;
alter table question_log enable row level security;

-- 데모용: 공개 읽기/쓰기.
-- 실제 운영 배포 시에는 아래 정책을 지우고 인증 사용자로 제한하세요.
drop policy if exists "kb public"  on kb_chunk;
drop policy if exists "log public" on question_log;

create policy "kb public"  on kb_chunk
  for all using (true) with check (true);

create policy "log public" on question_log
  for all using (true) with check (true);


-- ============================================================
--  (선택) 모호 조항 진단 뷰 — 대시보드용 집계
--  질문이 몰리면서 답변 불가율이 높은 조항 = 개정이 필요한 조항
-- ============================================================
create or replace view ambiguous_article as
select
  src                                        as source,
  count(*)                                   as question_count,
  count(*) filter (where not answerable)     as unanswerable_count,
  round(100.0 * count(*) filter (where not answerable) / count(*), 1) as unanswerable_pct
from question_log, unnest(sources) as src
group by src
order by unanswerable_count desc, question_count desc;
