-- =========================================================
-- migration-01：入場時段、未報到、場次可補填
-- 到 Supabase 後台 → SQL Editor → 貼上整份 → Run（只需要跑一次）
--
-- ★ 這份 SQL 全部都是「新增欄位」和「放寬限制」，
--   不會刪除或修改你現有的任何一筆場次、名單、報到時間。
--   已經存在的資料會自動帶入下面設定的預設值。
-- =========================================================

-- ---------- 1) 場次：title 和 席次 可以先留空 ----------
-- 因為報名可能比講座定名還早，先建立日期就好，title 之後再補。
-- （如果這兩欄本來就允許留空，這兩行不會有任何作用，也不會報錯）
alter table sessions alter column title drop not null;
alter table sessions alter column total_seats drop not null;

-- ---------- 2) 名單：入場時段 ----------
-- 宣語 / 攜幼 / 特殊。現有的資料會全部自動變成「宣語」。
alter table attendance
  add column if not exists entry_type text not null default '宣語';

-- 只允許這三種值，打錯字資料庫會直接擋下來
alter table attendance drop constraint if exists attendance_entry_type_check;
alter table attendance add constraint attendance_entry_type_check
  check (entry_type in ('宣語', '攜幼', '特殊'));

-- ---------- 3) 名單：未報到 ----------
-- 三種狀態：都沒勾 = 還沒處理；checked_in = 有到；no_show = 確定沒到
alter table attendance
  add column if not exists no_show boolean not null default false;

-- ---------- 4) 名單：現場登記 ----------
-- 標記「不是事先報名、當天臨時登記入場」的人，方便統計實際參與人數
alter table attendance
  add column if not exists walk_in boolean not null default false;

-- ---------- 5) 新欄位的權限 ----------
-- 前面 grant 的是整張表，新欄位會自動繼承，這裡再跑一次確保萬無一失
grant select, insert, update, delete on attendance to authenticated;
grant select, insert, update, delete on sessions   to authenticated;


-- =========================================================
-- 【可選，確定不要席次再跑】
-- 上面只是讓席次可以留空，欄位本身還留著（資料也還在）。
-- 如果你確定完全不需要席次了，再單獨執行下面這行把欄位刪掉：
--
--   alter table sessions drop column total_seats;
--
-- 刪掉後就救不回來了，所以我沒有預設幫你執行。
-- 不刪也完全不影響系統運作，畫面上已經看不到它了。
-- =========================================================
