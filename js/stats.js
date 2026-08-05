/* =========================================================
   stats.js —— 統計頁
   1) 從 participant_stats 這個 view 讀出「累計報到幾場」
   2) 另外查一次 attendance，算出每個人「未到幾場、是哪幾場」
   3) 可用姓名搜尋、切換排序；點名字展開看完整紀錄
   ========================================================= */

let stats = [];                 // participant_stats 的內容
let noShowMap = new Map();      // participant_id → [未到的場次…]

(async () => {
  if (!await requireAuth()) return;
  await load();
})();

async function load() {
  // 兩份資料同時去拿，比較快
  const [statsRes, noShowRes] = await Promise.all([
    sb.from('participant_stats').select('*'),
    sb.from('attendance')
      .select('participant_id, sessions(code, title, event_date)')
      .eq('no_show', true),
  ]);

  if (statsRes.error) return showError('讀取統計失敗', statsRes.error);
  if (noShowRes.error) return showError('讀取未到紀錄失敗', noShowRes.error);

  stats = statsRes.data;

  // 把未到紀錄依人分組
  noShowMap = new Map();
  noShowRes.data.forEach(r => {
    if (!noShowMap.has(r.participant_id)) noShowMap.set(r.participant_id, []);
    noShowMap.get(r.participant_id).push(r.sessions);
  });

  render();
}

$('#search').addEventListener('input', render);
$('#sortBy').addEventListener('change', render);

function noShowCount(p) {
  return noShowMap.get(p.id)?.length || 0;
}

function render() {
  const kw = $('#search').value.trim().toLowerCase();
  const sortBy = $('#sortBy').value;

  let list = stats.filter(p => !kw || (p.name || '').toLowerCase().includes(kw));

  list.sort((a, b) => {
    if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '', 'zh-Hant');
    if (sortBy === 'noshow') return noShowCount(b) - noShowCount(a);
    const diff = (a.sessions_attended || 0) - (b.sessions_attended || 0);
    return sortBy === 'asc' ? diff : -diff;
  });

  const totalIn = stats.reduce((sum, p) => sum + (p.sessions_attended || 0), 0);
  const totalOut = [...noShowMap.values()].reduce((sum, arr) => sum + arr.length, 0);
  $('#summary').textContent =
    `共 ${stats.length} 位參與者，累計報到 ${totalIn} 人次、未到 ${totalOut} 人次；目前顯示 ${list.length} 位。`;

  const ul = $('#list');
  if (!list.length) { ul.innerHTML = '<li class="muted">沒有符合的人。</li>'; return; }

  ul.innerHTML = list.map(p => {
    const out = noShowCount(p);
    return `<li>
      <div class="grow">
        <div class="name" style="cursor:pointer" data-detail="${p.id}">${esc(p.name)} <span class="muted">▾</span></div>
        <div class="sub" id="detail-${p.id}"></div>
      </div>
      <span class="badge">${p.sessions_attended || 0} 場</span>
      ${out ? `<span class="badge badge-err">未到 ${out}</span>` : ''}
    </li>`;
  }).join('');

  $$('[data-detail]', ul).forEach(el => el.onclick = () => showDetail(el.dataset.detail));
}

/* ---------- 點名字：展開完整紀錄 ---------- */
async function showDetail(participantId) {
  const box = $(`#detail-${participantId}`);
  if (!box) return;
  if (box.innerHTML) { box.innerHTML = ''; return; }   // 再點一次收合

  box.textContent = '查詢中…';

  const { data, error } = await sb
    .from('attendance')
    .select('checked_in, checked_in_at, no_show, entry_type, walk_in, sessions(code, title, event_date)')
    .eq('participant_id', participantId);

  if (error) { box.textContent = ''; return showError('查詢紀錄失敗', error); }

  const useful = data.filter(r => r.checked_in || r.no_show);
  if (!useful.length) { box.textContent = '（還沒有報到或未到的紀錄）'; return; }

  useful.sort((a, b) => (a.sessions?.event_date || '').localeCompare(b.sessions?.event_date || ''));

  box.innerHTML = useful.map(r => {
    const when = `${esc(r.sessions?.event_date || '')}　${esc(r.sessions?.title?.trim() || '（未定名）')}`;
    if (r.no_show) return `<span class="t-red">✗ 未到</span>　${when}`;
    const time = r.checked_in_at ? `　${esc(fmtTime(r.checked_in_at, r.sessions?.event_date))}` : '';
    return `<span class="t-green">✓</span>　${when}　<span class="muted">${esc(r.entry_type || '')}${r.walk_in ? '・現場' : ''}</span>${time}`;
  }).join('<br>');
}
