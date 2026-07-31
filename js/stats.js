/* =========================================================
   stats.js —— 統計頁
   從資料庫的 participant_stats 這個 view 讀出
   「每個人累計報到過幾場」，可用姓名搜尋、切換排序。
   點名字可以展開看他參加過哪些場次。
   ========================================================= */

let stats = [];

(async () => {
  if (!await requireAuth()) return;
  await load();
})();

async function load() {
  const { data, error } = await sb.from('participant_stats').select('*');
  if (error) return showError('讀取統計失敗', error);
  stats = data;
  render();
}

$('#search').addEventListener('input', render);
$('#sortBy').addEventListener('change', render);

function render() {
  const kw = $('#search').value.trim().toLowerCase();
  const sortBy = $('#sortBy').value;

  let list = stats.filter(p => !kw || (p.name || '').toLowerCase().includes(kw));

  list.sort((a, b) => {
    if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '', 'zh-Hant');
    const diff = (a.sessions_attended || 0) - (b.sessions_attended || 0);
    return sortBy === 'asc' ? diff : -diff;
  });

  const total = stats.reduce((sum, p) => sum + (p.sessions_attended || 0), 0);
  $('#summary').textContent =
    `共 ${stats.length} 位參與者，累計報到 ${total} 人次；目前顯示 ${list.length} 位。`;

  const ul = $('#list');
  if (!list.length) { ul.innerHTML = '<li class="muted">沒有符合的人。</li>'; return; }

  ul.innerHTML = list.map(p => `
    <li>
      <div class="grow">
        <div class="name" style="cursor:pointer" data-detail="${p.id}">${esc(p.name)} <span class="muted">▾</span></div>
        <div class="sub" id="detail-${p.id}"></div>
      </div>
      <span class="badge">${p.sessions_attended || 0} 場</span>
    </li>`).join('');

  $$('[data-detail]', ul).forEach(el => el.onclick = () => showDetail(el.dataset.detail));
}

/* ---------- 點名字：看他參加過哪些場次 ---------- */
async function showDetail(participantId) {
  const box = $(`#detail-${participantId}`);
  if (!box) return;
  if (box.innerHTML) { box.innerHTML = ''; return; }   // 再點一次收合

  box.textContent = '查詢中…';

  const { data, error } = await sb
    .from('attendance')
    .select('checked_in, checked_in_at, sessions(code, title, event_date)')
    .eq('participant_id', participantId)
    .eq('checked_in', true);

  if (error) { box.textContent = ''; return showError('查詢紀錄失敗', error); }

  if (!data.length) { box.textContent = '（還沒有報到紀錄）'; return; }

  data.sort((a, b) => (a.sessions?.event_date || '').localeCompare(b.sessions?.event_date || ''));
  box.innerHTML = data.map(r =>
    `${esc(r.sessions?.event_date || '')}　${esc(r.sessions?.code || '')} ${esc(r.sessions?.title || '')}` +
    (r.checked_in_at ? `　${esc(fmtTime(r.checked_in_at, r.sessions?.event_date))}` : '')
  ).join('<br>');
}
