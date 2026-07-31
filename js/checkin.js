/* =========================================================
   checkin.js —— 報到頁
   功能：
   1) 選場次 → 列出這場所有人（依座位號）
   2) 點大方框 → checked_in 設 true、checked_in_at 設現在時間；再點一次取消
   3) 已報到的人可以點時間手動修改（補登或打錯時修正）
   4) 上方顯示「已報到 X / 總數 N」
   5) 「全部標記已報到」／「全部取消報到」
   ========================================================= */

let session = null;
let rows = [];          // 這場所有人

(async () => {
  if (!await requireAuth()) return;

  const sel = $('#sessionSelect');
  const sessions = await loadSessionOptions(sel);

  const fromUrl = new URLSearchParams(location.search).get('session');
  if (fromUrl && sessions.some(s => String(s.id) === fromUrl)) sel.value = fromUrl;

  sel.addEventListener('change', () => onSessionChange(sessions));
  onSessionChange(sessions);
})();

function onSessionChange(sessions) {
  session = sessions.find(s => String(s.id) === String($('#sessionSelect').value)) || null;
  $('#mainCard').hidden = !session;
  $('#listCard').hidden = !session;
  if (session) load();
}

/* ---------- 讀取這場的人 ---------- */
async function load() {
  const { data, error } = await sb
    .from('attendance')
    .select('*, participants(id, name, gender, note)')
    .eq('session_id', session.id)
    .order('seat_no', { ascending: true });

  if (error) return showError('讀取名單失敗', error);
  rows = data;
  render();
}

$('#search').addEventListener('input', render);

/* ---------- 畫出畫面 ---------- */
function render() {
  const done = rows.filter(r => r.checked_in).length;
  $('#doneCount').textContent = done;
  $('#totalCount').textContent = rows.length;

  const kw = $('#search').value.trim().toLowerCase();
  const shown = rows.filter(r =>
    !kw ||
    (r.participants?.name || '').toLowerCase().includes(kw) ||
    (r.ticket_id || '').toLowerCase().includes(kw));

  const ul = $('#list');
  if (!shown.length) {
    ul.innerHTML = '<li class="muted">沒有資料。請先到「名單」頁把人加進這場。</li>';
    return;
  }

  ul.innerHTML = shown.map(r => `
    <li class="checkin-item" data-id="${r.id}">
      <button class="big-check ${r.checked_in ? 'on' : ''}" data-toggle="${r.id}">
        ${r.checked_in ? '✓' : ''}
      </button>
      <span class="seat">${r.seat_no ?? '-'}</span>
      <div class="grow">
        <div class="name">${esc(r.participants?.name || '（找不到姓名）')}</div>
        <div class="sub">${esc(r.ticket_id || '')}</div>
      </div>
      <div class="time-slot" data-slot="${r.id}">
        ${r.checked_in ? timeButtonHTML(r) : ''}
      </div>
    </li>`).join('');

  $$('[data-toggle]', ul).forEach(b => b.onclick = () => toggle(b.dataset.toggle));
  $$('[data-time]', ul).forEach(b => b.onclick = () => openTimeEditor(b.dataset.time));
}

// 已報到的人右邊那顆「時間」小按鈕
function timeButtonHTML(r) {
  const label = r.checked_in_at ? fmtTime(r.checked_in_at, session.event_date) : '補時間';
  return `<button class="time-btn" data-time="${r.id}">${esc(label)}</button>`;
}

/* ---------- 點大方框：報到 / 取消報到 ---------- */
async function toggle(id) {
  const r = rows.find(x => String(x.id) === String(id));
  if (!r) return;

  const next = !r.checked_in;
  const patch = {
    checked_in: next,
    checked_in_at: next ? new Date().toISOString() : null,   // 取消報到就把時間清掉
  };

  // 先改畫面（按起來很順），再送資料庫；失敗的話再改回來
  Object.assign(r, patch);
  render();

  const { error } = await sb.from('attendance').update(patch).eq('id', r.id);
  if (error) {
    Object.assign(r, { checked_in: !next, checked_in_at: next ? null : r.checked_in_at });
    render();
    showError('更新報到狀態失敗', error);
  }
}

/* ---------- 點時間：手動修改報到時間 ---------- */
function openTimeEditor(id) {
  const r = rows.find(x => String(x.id) === String(id));
  const slot = $(`[data-slot="${id}"]`);
  if (!r || !slot) return;

  // 沒有時間時，預設帶這場的日期 + 現在的時分，方便補登
  const value = r.checked_in_at
    ? toLocalInput(r.checked_in_at)
    : `${session.event_date}T${toLocalInput(new Date().toISOString()).slice(11)}`;

  slot.innerHTML = `
    <input type="datetime-local" class="time-input" value="${value}" style="width:190px">
    <div style="display:flex;gap:4px;margin-top:4px">
      <button class="small" data-save>存</button>
      <button class="small secondary" data-cancel>取消</button>
      <button class="small danger" data-clear>清空</button>
    </div>`;

  const input = $('.time-input', slot);
  input.focus();

  $('[data-save]', slot).onclick = () => saveTime(r, fromLocalInput(input.value));
  $('[data-clear]', slot).onclick = () => saveTime(r, null);   // 清空 = 有到但沒有精確時間
  $('[data-cancel]', slot).onclick = () => render();
}

async function saveTime(r, iso) {
  const patch = { checked_in: true, checked_in_at: iso };

  const { error } = await sb.from('attendance').update(patch).eq('id', r.id);
  if (error) return showError('修改報到時間失敗', error);

  Object.assign(r, patch);
  render();
  toast(iso ? '已更新報到時間' : '已清空報到時間（仍算有到）');
}

/* ---------- 一次處理全部 ---------- */
$('#allInBtn').addEventListener('click', () => bulk(true));
$('#allOutBtn').addEventListener('click', () => bulk(false));

async function bulk(checked) {
  if (!rows.length) return;
  const word = checked ? '全部標記已報到' : '全部取消報到';
  if (!confirm(`確定要把這場 ${rows.length} 個人${word}嗎？`)) return;

  // 補登舊場次時，通常沒有精確時間，所以只標記「有到」不寫時間。
  // 想要一起寫時間的話，把下面 null 改成 new Date().toISOString() 即可。
  const patch = { checked_in: checked, checked_in_at: null };

  const { error } = await sb.from('attendance').update(patch).eq('session_id', session.id);
  if (error) return showError(word + '失敗', error);

  rows.forEach(r => Object.assign(r, patch));
  render();
  toast('已' + word);
}
