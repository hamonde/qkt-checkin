/* =========================================================
   config.js —— 全部設定都放這裡，要改東西只要改這個檔案
   =========================================================
   1) SUPABASE_URL / SUPABASE_ANON_KEY：
      到 Supabase 後台 → Project Settings → Data API（或 API）
      複製「Project URL」和「anon public」金鑰貼進來。
      anon key 是可以公開的（放 GitHub 也沒關係），
      真正的安全是靠 Supabase 的 RLS 規則（見 sql/policies.sql）。

   2) TICKET_PREFIX：票號前綴。
      票號格式 = TICKET_PREFIX + 場次code + "-" + 座位號(補零兩位)
      例如 XYT-PRE-0801-15
   ========================================================= */

const SUPABASE_URL = 'https://dxsbfdmpvhxlnrpzgvnz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_pJSuZn9mBpzSZ4rggJFqPg_2AeAZ9LT';

const TICKET_PREFIX = 'XYT-PRE-';
