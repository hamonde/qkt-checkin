/* =========================================================
   app.js —— 每一頁都會載入的「共用工具箱」
   裡面有：連線到 Supabase、檢查登入、上方選單、
           小工具（找元素、跳提示、時間格式、CSV 處理…）
   ========================================================= */

/* ---------- 1. 建立 Supabase 連線 ---------- */
// CDN 版的函式庫會產生一個全域變數叫 supabase，
// 我們從裡面拿出 createClient，建立自己的連線物件，取名 sb。
// 之後所有頁面都用 sb.from('表名')... 來讀寫資料庫。
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------- 2. 小工具 ---------- */

// 用 CSS 選擇器抓一個 / 一組元素（少打一點字）
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// 把使用者輸入的文字變安全，避免有人在姓名裡打 HTML 標籤造成畫面壞掉
function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// 螢幕下方跳出一則短訊息（成功／錯誤都用它）
let toastTimer = null;
function toast(msg, type = 'ok') {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// 錯誤統一處理：印到主控台（F12 可看細節）＋跳紅色提示
function showError(prefix, error) {
  console.error(prefix, error);
  toast(prefix + '：' + (error?.message || error), 'err');
}

/* ---------- 3. 時間格式 ---------- */
// 資料庫存的是 UTC 時間字串（例如 2025-08-01T06:32:00Z）
// 這裡把它轉成台灣人看得懂的樣子。

// 顯示用：同一天只顯示 14:32，不同天顯示 8/1 14:32
function fmtTime(iso, sameDayRef) {
  if (!iso) return '';
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const isSameDay = sameDayRef &&
    d.toDateString() === new Date(sameDayRef + 'T00:00:00').toDateString();
  return isSameDay ? `${hh}:${mm}` : `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

// 給 <input type="datetime-local"> 用的格式：2025-08-01T14:32
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 從 <input type="datetime-local"> 讀回來，轉成資料庫要的格式
function fromLocalInput(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d) ? null : d.toISOString();
}

/* ---------- 4. 票號 ---------- */
// 例：makeTicket('0801', 15) → XYT-PRE-0801-15
function makeTicket(sessionCode, seatNo) {
  return `${TICKET_PREFIX}${sessionCode}-${String(seatNo).padStart(2, '0')}`;
}

/* ---------- 5. 登入檢查 ---------- */
// 每個需要登入的頁面，一開始就呼叫 requireAuth()。
// 沒登入就踢回登入頁；有登入就把畫面顯示出來並畫上方選單。
async function requireAuth() {
  const { data } = await sb.auth.getSession();
  if (!data.session) {
    location.replace('index.html');
    return null;
  }
  renderNav(data.session.user.email);
  document.body.classList.remove('loading');
  return data.session.user;
}

// 上方選單（每頁共用，改這裡就全部一起改）
function renderNav(email) {
  const nav = $('#nav');
  if (!nav) return;
  const page = location.pathname.split('/').pop() || 'index.html';
  const links = [
    ['sessions.html', '場次'],
    ['roster.html', '名單'],
    ['checkin.html', '報到'],
    ['stats.html', '統計'],
  ];
  nav.innerHTML = `
    <div class="nav-links">
      ${links.map(([href, text]) =>
        `<a href="${href}" class="${page === href ? 'active' : ''}">${text}</a>`).join('')}
    </div>
    <div class="nav-user">
      <span class="email">${esc(email)}</span>
      <button id="logoutBtn" class="btn-plain">登出</button>
    </div>`;
  $('#logoutBtn').onclick = async () => {
    await sb.auth.signOut();
    location.replace('index.html');
  };
}

/* ---------- 6. 場次下拉選單（名單頁／報到頁共用） ---------- */
// 讀出所有場次填進 <select>，並記住上次選的場次（存在瀏覽器裡）
async function loadSessionOptions(selectEl, storageKey = 'lastSessionId') {
  const { data, error } = await sb.from('sessions')
    .select('*').order('event_date', { ascending: false });
  if (error) { showError('讀取場次失敗', error); return []; }

  selectEl.innerHTML = '<option value="">— 請選擇場次 —</option>' +
    data.map(s => `<option value="${s.id}">${esc(s.event_date)}　${esc(s.code)}　${esc(s.title)}</option>`).join('');

  const remembered = localStorage.getItem(storageKey);
  if (remembered && data.some(s => String(s.id) === remembered)) {
    selectEl.value = remembered;
  }
  selectEl.addEventListener('change', () => {
    localStorage.setItem(storageKey, selectEl.value);
  });
  return data;
}

/* ---------- 7. CSV 工具 ---------- */

// 把二維陣列變成 CSV 文字並讓瀏覽器下載
// 前面加 ﻿ (BOM) 是為了讓 Excel 打開中文不會變亂碼
function downloadCSV(filename, rows) {
  const body = rows.map(r => r.map(cell => {
    const s = String(cell ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\r\n');

  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// 把 CSV 文字解析回二維陣列（支援用雙引號包住、含逗號的欄位）
function parseCSV(text) {
  text = text.replace(/^﻿/, '');           // 去掉 BOM
  const rows = [];
  let row = [], field = '', inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }  // 兩個雙引號 = 一個雙引號
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* 忽略 */ }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(cell => cell.trim() !== ''));   // 丟掉空白行
}

// CSV 裡的「已報到」欄位可能有各種寫法，通通判斷成 true / false
function parseYes(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return ['是', 'y', 'yes', 'true', '1', 'v', '有', 'ｖ', '✓', 'o'].includes(s);
}

// CSV 裡的「報到時間」欄位：
// 可以是 2025-08-01 14:32、2025/08/01 14:32、或只有 14:32（會自動補上場次日期）
function parseTimeCell(v, sessionDate) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    const [h, m] = s.split(':');
    const d = new Date(`${sessionDate}T${h.padStart(2, '0')}:${m}:00`);
    return isNaN(d) ? null : d.toISOString();
  }
  const d = new Date(s.replace(/\//g, '-').replace(' ', 'T'));
  return isNaN(d) ? null : d.toISOString();
}
