/* =========================================================
   checkin.js —— 報到頁
   功能：
   1) 選場次 → 列出這場所有人（依座位號）
   2) ✓ 完成報到、✗ 標記未到，再點一次可取消
   3) 報到時間依入場時段自動判斷顏色（綠／藍／紅），可手動修改
   4) 上方顯示「已報到 X / 總數 N」和「未到」
   5) 兩個切換鍵：顯示模式（姓名／僅編號）、名單篩選（全部／宣語／其他）
   6) 現場登記：非報名者臨時入場
   ========================================================= */

let session = null;
let rows = [];

// 兩個切換鍵的狀態（存在瀏覽器裡，下次打開會記得）
let hideNames = localStorage.getItem('hideNames') === '1';
let filterMode = localStorage.getItem('filterMode') || 'all';   // all | 宣語 | other
const revealed = new Set();      // 模式二時，被點開看姓名的人

(async () => {
  if (!await requireAuth()) return;

  const sel = $('#sessionSelect');
  const sessions = await loadSessionOptions(sel);

  const fromUrl = new URLSearchParams(location.search).get('session');
  if (fromUrl && sessions.some(s => String(s.id) === fromUrl)) sel.value = fromUrl;

  sel.addEventListener('change', () => onSessionChange(sessions));
  onSessionChange(sessions);
  updateToggleLabels();
})();

function onSessionChange(sessions) {
  session = sessions.find(s => String(s.id) === String($('#sessionSelect').value)) || null;
  ['#mainCard', '#listCard', '#walkInCard'].forEach(x => { $(x).hidden = !session; });
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

/* ---------- 兩個切換鍵 ---------- */
$('#modeBtn').addEventListener('click', () => {
  hideNames = !hideNames;
  revealed.clear();
  localStorage.setItem('hideNames', hideNames ? '1' : '0');
  updateToggleLabels();
  render();
});

$('#filterBtn').addEventListener('click', () => {
  // 全部 → 宣語 → 其他 → 全部…
  const order = ['all', '宣語', 'other'];
  filterMode = order[(order.indexOf(filterMode) + 1) % order.length];
  localStorage.setItem('filterMode', filterMode);
  updateToggleLabels();
  render();
});

function updateToggleLabels() {
  $('#modeBtn').textContent = hideNames ? '🙈 僅編號' : '👁 姓名';
  $('#filterBtn').textContent =
    filterMode === 'all' ? '全部名單' : filterMode === '宣語' ? '宣語入場' : '其他入場';
}

/* ---------- 畫出畫面 ---------- */
function render() {
  // 上方統計看的是「整場」，不受篩選和搜尋影響
  $('#doneCount').textContent = rows.filter(r => r.checked_in).length;
  $('#totalCount').textContent = rows.length;
  $('#noShowCount').textContent = rows.filter(r => r.no_show).length;

  const kw = $('#search').value.trim().toLowerCase();
  const shown = rows
    .filter(r => filterMode === 'all' ? true
      : filterMode === '宣語' ? r.entry_type === '宣語'
      : r.entry_type !== '宣語')                       // other = 攜幼 + 特殊
    .filter(r => !kw ||
      (r.participants?.name || '').toLowerCase().includes(kw) ||
      (r.ticket_id || '').toLowerCase().includes(kw));

  const ul = $('#list');
  if (!shown.length) {
    ul.innerHTML = '<li class="muted">沒有符合的資料。</li>';
    return;
  }

  ul.innerHTML = shown.map(r => `
    <li class="checkin-item" data-id="${r.id}">
      <button class="big-check ${r.checked_in ? 'on' : ''}" data-toggle="${r.id}">
        ${r.checked_in ? '✓' : ''}
      </button>
      <button class="big-check no ${r.no_show ? 'on' : ''}" data-noshow="${r.id}">✗</button>
      <div class="grow">
        ${nameBlockHTML(r)}
        <div class="sub">
          <span class="tag tag-${entryClass(r.entry_type)}">${esc(r.entry_type || '宣語')}</span>
          ${r.walk_in ? '<span class="tag">現場</span>' : ''}
        </div>
      </div>
      <div class="time-slot" data-slot="${r.id}">${r.checked_in ? timeButtonHTML(r) : ''}</div>
    </li>`).join('');

  $$('[data-toggle]', ul).forEach(b => b.onclick = () => toggle(b.dataset.toggle));
  $$('[data-noshow]', ul).forEach(b => b.onclick = () => toggleNoShow(b.dataset.noshow));
  $$('[data-time]', ul).forEach(b => b.onclick = () => openTimeEditor(b.dataset.time));
  $$('[data-reveal]', ul).forEach(b => b.onclick = () => {
    const id = b.dataset.reveal;
    revealed.has(id) ? revealed.delete(id) : revealed.add(id);
    render();
  });
}

// 模式一：座位號 + 姓名
// 模式二：只有大大的座位號，點下去才顯示姓名
function nameBlockHTML(r) {
  const name = esc(r.participants?.name || '（找不到姓名）');
  if (!hideNames) {
    return `<div class="name"><span class="seat">${r.seat_no ?? '-'}</span> ${name}</div>`;
  }
  const open = revealed.has(String(r.id));
  return `<div class="name">
    <button class="seat-big" data-reveal="${r.id}">${r.seat_no ?? '-'}</button>
    ${open ? ` ${name}` : ''}
  </div>`;
}

function entryClass(t) {
  return t === '攜幼' ? 'child' : t === '特殊' ? 'special' : 'main';
}

// 已報到的人右邊那顆時間按鈕，顏色依照入場時段自動判斷
function timeButtonHTML(r) {
  if (!r.checked_in_at) return `<button class="time-btn" data-time="${r.id}">補時間</button>`;
  const color = checkinColor(r.entry_type || '宣語', r.checked_in_at);
  return `<button class="time-btn t-${color}" data-time="${r.id}" title="${esc(COLOR_HINT[color] || '')}">
    ${esc(fmtTime(r.checked_in_at, session.event_date))}
  </button>`;
}

/* ---------- ✓ 報到 / 取消 ---------- */
async function toggle(id) {
  const r = rows.find(x => String(x.id) === String(id));
  if (!r) return;

  const next = !r.checked_in;
  const patch = {
    checked_in: next,
    checked_in_at: next ? new Date().toISOString() : null,
    no_show: false,                     // 報到了就不可能是未到
  };
  await save(r, patch, next ? '已報到' : '已取消報到');
}

/* ---------- ✗ 未到 / 取消 ---------- */
async function toggleNoShow(id) {
  const r = rows.find(x => String(x.id) === String(id));
  if (!r) return;

  const next = !r.no_show;
  const patch = {
    no_show: next,
    checked_in: false,                  // 標記未到就把報到清掉
    checked_in_at: null,
  };
  await save(r, patch, next ? '已標記未到' : '已取消未到');
}

// 共用：先改畫面（按起來順），再送資料庫；失敗就還原
async function save(r, patch, msg) {
  const before = { checked_in: r.checked_in, checked_in_at: r.checked_in_at, no_show: r.no_show };
  Object.assign(r, patch);
  render();

  const { error } = await sb.from('attendance').update(patch).eq('id', r.id);
  if (error) {
    Object.assign(r, before);
    render();
    return showError('更新失敗', error);
  }
  if (msg) toast(msg);
}

/* ---------- 手動修改報到時間 ---------- */
function openTimeEditor(id) {
  const r = rows.find(x => String(x.id) === String(id));
  const slot = $(`[data-slot="${id}"]`);
  if (!r || !slot) return;

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
  $('[data-clear]', slot).onclick = () => saveTime(r, null);
  $('[data-cancel]', slot).onclick = () => render();
}

async function saveTime(r, iso) {
  await save(r, { checked_in: true, no_show: false, checked_in_at: iso },
    iso ? '已更新報到時間' : '已清空報到時間（仍算有到）');
}

/* ---------- 一次處理全部 ---------- */
$('#allInBtn').addEventListener('click', () => bulk(true));
$('#allOutBtn').addEventListener('click', () => bulk(false));

async function bulk(checked) {
  if (!rows.length) return;
  const word = checked ? '全部標記已報到' : '全部取消報到';
  if (!confirm(`確定要把這場 ${rows.length} 個人${word}嗎？`)) return;

  // 補登舊場次時通常沒有精確時間，所以只標記「有到」不寫時間
  const patch = { checked_in: checked, checked_in_at: null, no_show: false };

  const { error } = await sb.from('attendance').update(patch).eq('session_id', session.id);
  if (error) return showError(word + '失敗', error);

  rows.forEach(r => Object.assign(r, patch));
  render();
  toast('已' + word);
}

/* ---------- 現場登記（非報名者臨時入場） ---------- */
$('#walkInForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#wName').value.trim();
  if (!name || !session) return;

  try {
    // 1) 先建立這個人（之後的統計才會累加到他身上）
    const { data: person, error: e1 } = await sb.from('participants')
      .insert({ name, note: $('#wNote').value.trim() || null }).select().single();
    if (e1) throw e1;

    // 2) 接在名單最後面，直接算已報到
    const seat = rows.length + 1;
    const { error: e2 } = await sb.from('attendance').insert({
      session_id: session.id,
      participant_id: person.id,
      seat_no: seat,
      ticket_id: makeTicket(session.code, seat),
      entry_type: $('#wEntryType').value,
      checked_in: true,
      checked_in_at: new Date().toISOString(),
      walk_in: true,
    });
    if (e2) throw e2;

    toast(`已登記 ${name}（座位 ${seat}）`);
    $('#walkInForm').reset();
    await load();
  } catch (err) {
    showError('現場登記失敗', err);
  }
});
