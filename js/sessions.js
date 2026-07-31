/* =========================================================
   sessions.js —— 場次頁
   功能：新增場次、列出所有場次、顯示每場已加入人數、刪除場次
   ========================================================= */

let user = null;

// 頁面一載入：先檢查登入，再把場次列出來
(async () => {
  user = await requireAuth();
  if (!user) return;                          // 沒登入的話 requireAuth 已經把人踢走了

  // 日期預設今天（但可以自由改成過去的日期，補登舊場次用）
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
    title: $('#title').value.trim(),
    event_date: $('#event_date').value,             // 格式 2025-08-01
    total_seats: Number($('#total_seats').value),
  };

  const { error } = await sb.from('sessions').insert(payload);
  btn.disabled = false;

  if (error) return showError('新增場次失敗', error);

  toast('已新增場次 ' + payload.code);
  $('#sessionForm').reset();
  $('#event_date').valueAsDate = new Date();
  loadSessions();
});

/* ---------- 列出所有場次 ---------- */
async function loadSessions() {
  // select 裡的 attendance(count) 是 Supabase 的小技巧：
  // 順便算出這場關聯了幾筆 attendance（＝這場名單有幾個人）
  const { data, error } = await sb
    .from('sessions')
    .select('*, attendance(count)')
    .order('event_date', { ascending: false });

  if (error) return showError('讀取場次失敗', error);

  const box = $('#list');
  if (!data.length) { box.innerHTML = '<p class="muted">還沒有任何場次，先在上面新增一場吧。</p>'; return; }

  box.innerHTML = '<ul class="list">' + data.map(s => {
    const joined = s.attendance?.[0]?.count ?? 0;
    return `<li>
      <div class="grow">
        <div class="name">${esc(s.code)}　${esc(s.title)}</div>
        <div class="sub">${esc(s.event_date)}　名單 ${joined} 人 / 總席次 ${s.total_seats ?? '-'}</div>
      </div>
      <a class="btn-plain" href="roster.html?session=${s.id}">名單</a>
      <a class="btn-plain" href="checkin.html?session=${s.id}">報到</a>
      <button class="small danger" data-del="${s.id}" data-code="${esc(s.code)}">刪除</button>
    </li>`;
  }).join('') + '</ul>';

  // 幫每個刪除鈕綁上事件
  $$('[data-del]', box).forEach(btn => {
    btn.onclick = () => deleteSession(btn.dataset.del, btn.dataset.code);
  });
}

/* ---------- 刪除場次 ---------- */
async function deleteSession(id, code) {
  if (!confirm(`確定要刪除場次「${code}」嗎？\n這場的名單與報到紀錄也會一起刪除，無法復原。`)) return;

  // 先刪掉這場的名單（attendance），再刪場次本身，
  // 否則資料庫的關聯限制會擋住刪除。
  const { error: e1 } = await sb.from('attendance').delete().eq('session_id', id);
  if (e1) return showError('刪除名單失敗', e1);

  const { error: e2 } = await sb.from('sessions').delete().eq('id', id);
  if (e2) return showError('刪除場次失敗', e2);

  toast('已刪除場次 ' + code);
  loadSessions();
}
