-- =========================================================
-- policies.sql
-- 到 Supabase 後台 → SQL Editor → 貼上整份 → Run
--
-- Postgres 有「兩道門」，兩道都要開，程式才讀得到資料：
--   第一道 GRANT：這張表「允許哪個角色碰」
--     → 沒開的話會看到「permission denied for table xxx」
--   第二道 RLS  ：碰得到表之後，「允許看／改哪些資料列」
--     → 沒開的話任何人拿到 anon key 都能讀走全部資料
--
-- 這份 SQL 把兩道門都設定好：
--   已登入的工作人員可以讀寫全部資料，沒登入的人什麼都拿不到。
-- =========================================================

-- ---------- 0) 第一道門：GRANT 表的使用權 ----------
-- authenticated = 已經登入的人。
-- 這裡「沒有」給 anon（沒登入的人）任何權限，所以外人拿到 anon key 也打不開門。
grant usage on schema public to authenticated;

grant select, insert, update, delete on participants to authenticated;
grant select, insert, update, delete on sessions     to authenticated;
grant select, insert, update, delete on attendance   to authenticated;

-- 新增資料時 id 是資料庫自動編號產生的，
-- 所以也要給「自動編號器（sequence）」的使用權，否則 insert 會失敗。
grant usage, select on all sequences in schema public to authenticated;

-- ---------- 1) 第二道門：打開 RLS ----------
alter table participants enable row level security;
alter table sessions     enable row level security;
alter table attendance   enable row level security;

-- ---------- 2) 允許登入者做任何操作 ----------
-- 重複執行這份 SQL 前，先用 drop policy 避免「已存在」的錯誤
drop policy if exists "staff_all_participants" on participants;
create policy "staff_all_participants" on participants
  for all to authenticated using (true) with check (true);

drop policy if exists "staff_all_sessions" on sessions;
create policy "staff_all_sessions" on sessions
  for all to authenticated using (true) with check (true);

drop policy if exists "staff_all_attendance" on attendance;
create policy "staff_all_attendance" on attendance
  for all to authenticated using (true) with check (true);

-- ---------- 3) 統計 view 的讀取權限 ----------
grant select on participant_stats to authenticated;

-- ---------- 4)（建議，非必要）避免同一場出現重複號碼 ----------
-- 加了這兩條之後，同一場不會有兩個座位 1，票號也不會重複。
-- 程式裡的「重新編號」已經考慮過這個限制（先搬到暫時號碼再改成正式號碼）。
-- 如果你的資料表已經有重複資料，這兩行會執行失敗，
-- 先清乾淨重複資料再跑一次即可。
create unique index if not exists attendance_session_seat_uniq
  on attendance (session_id, seat_no);
create unique index if not exists attendance_ticket_uniq
  on attendance (ticket_id);

-- ---------- 參考：participant_stats 這個 view 的定義 ----------
-- 如果你的 view 還沒建立，或想確認算法一致，可以用這段：
--
-- create or replace view participant_stats as
-- select p.id,
--        p.name,
--        count(a.id) filter (where a.checked_in) as sessions_attended
-- from participants p
-- left join attendance a on a.participant_id = p.id
-- group by p.id, p.name;
