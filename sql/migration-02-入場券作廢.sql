-- =========================================================
-- migration-02：入場券作廢（活動前取消）
-- 到 Supabase 後台 → SQL Editor → 開一個「新的空白分頁」→ 貼上整份 → Run
--
-- ★ 只有新增欄位，不會修改或刪除任何現有資料。
--   現有的名單全部預設為「未作廢」。
-- =========================================================

-- 是否已作廢（true = 這張入場券取消了，不能報到）
alter table attendance
  add column if not exists cancelled boolean not null default false;

-- 作廢的時間（方便事後查是什麼時候取消的）
alter table attendance
  add column if not exists cancelled_at timestamptz;

-- 讓 Supabase 立刻認得新欄位
notify pgrst, 'reload schema';
