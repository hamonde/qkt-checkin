/* =========================================================
   sessions.js —— 場次頁
   功能：新增場次、列出所有場次、修改場次資訊、刪除場次

   註：場次代碼（code）只用來產生票號，畫面上的場次標題不顯示它。
       講座名稱可以先留空（報名常常比定名還早），之後用「修改」補上。
   ========================================================= */

let user = null;
let sessions = [];
let editingId = null;      // 目前正在修改哪一場（null = 沒有）

(async () => {
  user = await requireAuth();
  if (!user) return;

  $('#event_date').valueAsDate = new Date();

  // 一邊打 code，一邊預覽票號長怎樣
  $('#code').addEventListener('input', () => {
    $('#ticketPreview').textContent = makeTicket($('#code').value.trim() || '0801', 1);
  });

  loadSessions();
})();

/* ---------- 新增場次 ---------- */
$('#sessionForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#saveBtn');
  btn.disabled = true;

  const payload = {
    code: $('#code').value.trim(),
    title: $('#title').value.trim() || null,      // 留空就先不填
    event_date: $('#event_date').value,
  };

  const { error } = await sb.from('sessions').insert(payload);
  btn.disabled = false;

  if (error) return showError('新增場次失敗', error);

  toast('已新增場次');
  $('#sessionForm').reset();
  $('#event_date').valueAsDate = new Date();
  loadSessions();
});

/* ---------- 列出所有場次 ---------- */
async function loadSessions() {
  // attendance(count) 會順便算出這場的名單有幾個人
  const { data, error } = await sb
    .from('sessions')
    .select('*, attendance(count)')
    .order('event_date', { ascending: false });

  if (error) return showError('讀取場次失敗', error);

  sessions = data;
  render();
}

function render() {
  const box = $('#list');
  if (!sessions.length) {
    box.innerHTML = '<p class="muted">還沒有任何場次，先在上面新增一場吧。</p>';
    return;
  }

  box.innerHTML = '<ul class="list">' + sessions.map(s =>
    editingId === s.id ? editFormHTML(s) : rowHTML(s)
  ).join('') + '</ul>';

  // 一般狀態的按鈕
  $$('[data-edit]', box).forEach(b => b.onclick = () => { editingId = +b.dataset.edit; render(); });
  $$('[data-del]', box).forEach(b => b.onclick = () => deleteSession(b.dataset.del));

  // 修改狀態的按鈕
  $$('[data-save]', box).forEach(b => b.onclick = () => saveEdit(+b.dataset.save));
  $$('[data-cancel]', box).forEach(b => b.onclick = () => { editingId = null; render(); });
}

// 一般顯示的樣子
function rowHTML(s) {
  const joined = s.attendance?.[0]?.count ?? 0;
  const untitled = !s.title?.trim();
  return `<li>
    <div class="grow">
      <div class="name">${esc(s.event_date)}　${untitled
        ? '<span class="muted">（未定名）</span>' : esc(s.title)}</div>
      <div class="sub">已報名 ${joined} 人　票號代碼 ${esc(s.code)}</div>
    </div>
    <a class="btn-plain" href="roster.html?session=${s.id}">名單</a>
    <a class="btn-plain" href="checkin.html?session=${s.id}">報到</a>
    <button class="small secondary" data-edit="${s.id}">修改</button>
    <button class="small danger" data-del="${s.id}">刪除</button>
  </li>`;
}

// 按下「修改」後展開的表單
function editFormHTML(s) {
  return `<li style="display:block">
    <div class="row">
      <div class="field">
        <label>日期</label>
        <input type="date" id="e-date" value="${esc(s.event_date)}">
      </div>
      <div class="field">
        <label>票號代碼 code</label>
        <input type="text" id="e-code" value="${esc(s.code || '')}">
      </div>
    </div>
    <div class="field">
      <label>講座名稱（可留空）</label>
      <input type="text" id="e-title" value="${esc(s.title || '')}" placeholder="未定名">
    </div>
    <p class="muted">改了代碼之後，這場名單的票號會全部重新產生一次。</p>
    <div class="row">
      <button class="small" data-save="${s.id}">儲存</button>
      <button class="small secondary" data-cancel>取消</button>
    </div>
  </li>`;
}

/* ---------- 儲存修改 ---------- */
async function saveEdit(id) {
  const s = sessions.find(x => x.id === id);
  const newCode = $('#e-code').value.trim();
  const codeChanged = newCode !== (s.code || '');

  const patch = {
    event_date: $('#e-date').value,
    code: newCode,
    title: $('#e-title').value.trim() || null,
  };

  const { error } = await sb.from('sessions').update(patch).eq('id', id);
  if (error) return showError('修改失敗', error);

  // 代碼改了的話，這場所有人的票號都要跟著換
  if (codeChanged) await rebuildTickets(id, newCode);

  editingId = null;
  toast('已更新場次資訊');
  loadSessions();
}

// 依照新的代碼，把這場名單的票號重新產生一次（座位號不變）
async function rebuildTickets(sessionId, code) {
  const { data, error } = await sb.from('attendance')
    .select('*').eq('session_id', sessionId).order('seat_no');
  if (error) return showError('讀取名單失敗', error);
  if (!data.length) return;

  // 先換成不會撞號的暫時值，再換成正式票號
  const temp = data.map(r => ({ ...r, ticket_id: `TMP-${r.id}` }));
  const { error: e1 } = await sb.from('attendance').upsert(temp);
  if (e1) return showError('更新票號失敗', e1);

  const final = data.map(r => ({ ...r, ticket_id: makeTicket(code, r.seat_no) }));
  const { error: e2 } = await sb.from('attendance').upsert(final);
  if (e2) return showError('更新票號失敗', e2);

  toast(`已重新產生 ${final.length} 張票號`);
}

/* ---------- 刪除場次 ---------- */
async function deleteSession(id) {
  const s = sessions.find(x => String(x.id) === String(id));
  const label = sessionLabel(s);
  if (!confirm(`確定要刪除場次「${label}」嗎？\n這場的名單與報到紀錄也會一起刪除，無法復原。`)) return;

  const { error: e1 } = await sb.from('attendance').delete().eq('session_id', id);
  if (e1) return showError('刪除名單失敗', e1);

  const { error: e2 } = await sb.from('sessions').delete().eq('id', id);
  if (e2) return showError('刪除場次失敗', e2);

  toast('已刪除場次');
  loadSessions();
}
