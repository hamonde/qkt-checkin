/* =========================================================
   stats.js —— 統計頁
   1) 從 participant_stats 這個 view 讀出「累計報到幾場」
   2) 另外查一次 attendance，算出每個人「未到幾場」和「取消（作廢）幾場」
   3) 可用姓名搜尋、切換排序；點名字展開看完整紀錄
   ========================================================= */

let stats = [];                 // participant_stats 的內容
let noShowMap = new Map();      // participant_id → [未到的場次…]
let voidMap = new Map();        // participant_id → [取消（入場券作廢）的場次…]

(async () => {
  if (!await requireAuth()) return;
  await load();
})();

async function load() {
  // 兩份資料同時去拿，比較快
  const [statsRes, markRes] = await Promise.all([
    sb.from('participant_stats').select('*'),
    // 一次拿回「未到」或「作廢」的紀錄
    sb.from('attendance')
      .select('participant_id, no_show, cancelled, sessions(code, title, event_date)')
      .or('no_show.eq.true,cancelled.eq.true'),
  ]);

  if (statsRes.error) return showError('讀取統計失敗', statsRes.error);
  if (markRes.error) return showError('讀取未到／取消紀錄失敗', markRes.error);

  stats = statsRes.data;

  // 依人分組（id 一律轉字串，避免 bigint 型別對不上）
  noShowMap = new Map();
  voidMap = new Map();
  const push = (map, r) => {
    const k = String(r.participant_id);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r.sessions);
  };
  markRes.data.forEach(r => {
    if (r.cancelled) push(voidMap, r);       // 作廢優先，不會同時算未到
    else if (r.no_show) push(noShowMap, r);
  });

  render();
}

$('#search').addEventListener('input', render);
$('#sortBy').addEventListener('change', render);

function noShowCount(p) {
  return noShowMap.get(String(p.id))?.length || 0;
}
function voidCount(p) {
  return voidMap.get(String(p.id))?.length || 0;
}

function render() {
  const kw = $('#search').value.trim().toLowerCase();
  const sortBy = $('#sortBy').value;

  let list = stats.filter(p => !kw || (p.name || '').toLowerCase().includes(kw));

  list.sort((a, b) => {
    if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '', 'zh-Hant');
    if (sortBy === 'noshow') return noShowCount(b) - noShowCount(a);
    if (sortBy === 'void') return voidCount(b) - voidCount(a);
    const diff = (a.sessions_attended || 0) - (b.sessions_attended || 0);
    return sortBy === 'asc' ? diff : -diff;
  });

  const totalIn = stats.reduce((sum, p) => sum + (p.sessions_attended || 0), 0);
  const totalOut = [...noShowMap.values()].reduce((sum, arr) => sum + arr.length, 0);
  const totalVoid = [...voidMap.values()].reduce((sum, arr) => sum + arr.length, 0);
  $('#summary').textContent =
    `共 ${stats.length} 位參與者，累計報到 ${totalIn} 人次、未到 ${totalOut} 人次、` +
    `取消 ${totalVoid} 人次；目前顯示 ${list.length} 位。`;

  const ul = $('#list');
  if (!list.length) { ul.innerHTML = '<li class="muted">沒有符合的人。</li>'; return; }

  ul.innerHTML = list.map(p => {
    const out = noShowCount(p);
    const voided = voidCount(p);
    return `<li>
      <div class="grow">
        <div class="name" style="cursor:pointer" data-detail="${p.id}">${esc(p.name)} <span class="muted">▾</span></div>
        <div class="sub" id="detail-${p.id}"></div>
      </div>
      <span class="badge">${p.sessions_attended || 0} 場</span>
      ${out ? `<span class="badge badge-err">未到 ${out}</span>` : ''}
      ${voided ? `<span class="badge badge-void">取消 ${voided}</span>` : ''}
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
    .select('checked_in, checked_in_at, no_show, cancelled, entry_type, walk_in, sessions(code, title, event_date)')
    .eq('participant_id', participantId);

  if (error) { box.textContent = ''; return showError('查詢紀錄失敗', error); }

  const useful = data.filter(r => r.checked_in || r.no_show || r.cancelled);
  if (!useful.length) { box.textContent = '（還沒有報到、未到或取消的紀錄）'; return; }

  useful.sort((a, b) => (a.sessions?.event_date || '').localeCompare(b.sessions?.event_date || ''));

  box.innerHTML = useful.map(r => {
    const when = `${esc(r.sessions?.event_date || '')}　${esc(r.sessions?.title?.trim() || '（未定名）')}`;
    if (r.cancelled) return `<span class="muted">⊘ 取消</span>　${when}`;
    if (r.no_show) return `<span class="t-red">✗ 未到</span>　${when}`;
    const time = r.checked_in_at ? `　${esc(fmtTime(r.checked_in_at, r.sessions?.event_date))}` : '';
    return `<span class="t-green">✓</span>　${when}　<span class="muted">${esc(r.entry_type || '')}${r.walk_in ? '・現場' : ''}</span>${time}`;
  }).join('<br>');
}
