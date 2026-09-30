-- =========================================================
-- migration-03：每場自訂入場時段
-- 到 Supabase 後台 → SQL Editor → 開一個「新的空白分頁」→ 貼上整份 → Run
--
-- ★ 只有新增欄位，不會修改或刪除任何現有資料。
--   現有場次這兩欄會是空的，系統會自動沿用預設的 12:50 / 13:15。
-- =========================================================

-- 宣語入場的最晚報到時間（超過就算遲到，顯示紅色）
alter table sessions
  add column if not exists xuanyu_deadline time;

-- 攜幼／特殊入場的開放報到時間（到了才算正常入場，顯示藍色）
alter table sessions
  add column if not exists other_open time;

-- 讓 Supabase 立刻認得新欄位
notify pgrst, 'reload schema';
