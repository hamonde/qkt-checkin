-- =========================================================
-- migration-04：活動形式（線上／線下）＋ 入場時段改為非必填
-- 到 Supabase 後台 → SQL Editor → 開一個「新的空白分頁」→ 貼上整份 → Run
--
-- ★ 只有新增欄位和放寬限制，不會修改或刪除任何現有資料。
--   現有場次的形式會是空的（系統當成「線下」），
--   現有名單的入場時段維持原本的值，不受影響。
-- =========================================================

-- ---------- 1) 場次：活動形式 ----------
alter table sessions
  add column if not exists format text;

-- 只允許這兩種（留空代表還沒設定，系統當成線下）
alter table sessions drop constraint if exists sessions_format_check;
alter table sessions add constraint sessions_format_check
  check (format is null or format in ('線下', '線上'));

-- ---------- 2) 名單：入場時段改為可留空 ----------
-- 線上活動沒有攜幼、特殊入場的分流，整場都不用選時段。
-- 留空（null）代表「不分時段」，報到時間就不會做顏色判斷。
alter table attendance
  alter column entry_type drop not null;

-- 原本的檢查規則對 null 本來就會放行，這裡重寫一次讓意思更明確
alter table attendance drop constraint if exists attendance_entry_type_check;
alter table attendance add constraint attendance_entry_type_check
  check (entry_type is null or entry_type in ('宣語', '攜幼', '特殊'));

-- 讓 Supabase 立刻認得這些變更
notify pgrst, 'reload schema';
