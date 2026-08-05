/* =========================================================
   roster.js —— 名單頁
   功能：
   1) 選場次 → 顯示這場名單
   2) 調整順序（⬆⬇ 或拖曳）→ 自動重新編 seat_no 與 ticket_id
   3) 從既有參與者挑人加入 / 新增全新的人
   4) 匯出 CSV（給 Canva 做票）
   5) 匯入 CSV 建立整場名單（補登歷史場次）
   ========================================================= */

let session = null;      // 目前選的場次資料
let roster = [];         // 目前名單（陣列的順序 = 畫面由上到下的順序）
let allPeople = [];      // 資料庫裡所有參與者
let csvRows = null;      // 匯入前先解析好的 CSV 內容

/* ---------- 進入頁面 ---------- */
(async () => {
  if (!await requireAuth()) return;

  const sel = $('#sessionSelect');
  const sessions = await loadSessionOptions(sel);

  // 如果網址是 roster.html?session=3，就自動選那一場
  const fromUrl = new URLSearchParams(location.search).get('session');
  if (fromUrl && sessions.some(s => String(s.id) === fromUrl)) sel.value = fromUrl;

  sel.addEventListener('change', () => onSessionChange(sessions));
  onSessionChange(sessions);

  loadAllPeople();
})();

function onSessionChange(sessions) {
  const id = $('#sessionSelect').value;
  session = sessions.find(s => String(s.id) === String(id)) || null;

  // 沒選場次就把下面幾張卡片藏起來
  ['#rosterCard', '#addCard', '#newCard', '#importCard'].forEach(sel => {
    $(sel).hidden = !session;
  });
  if (session) loadRoster();
}

/* ---------- 讀取這場名單 ---------- */
async function loadRoster() {
  // participants(...) 是「順便把關聯的參與者資料一起帶回來」
  const { data, error } = await sb
    .from('attendance')
    .select('*, participants(id, name, gender, note)')
    .eq('session_id', session.id)
    .order('seat_no', { ascending: true });

  if (error) return showError('讀取名單失敗', error);

  roster = data;
  renderRoster();
  renderPeople();          // 已在名單裡的人要從「可加入」清單移除
}

/* ---------- 畫出名單 ---------- */
function renderRoster() {
  $('#countBadge').textContent = roster.length + ' 人';
  const ul = $('#rosterList');

  if (!roster.length) {
    ul.innerHTML = '<li class="muted">這場還沒有人，用下面的區塊加人。</li>';
    return;
  }

  ul.innerHTML = roster.map((r, i) => `
    <li draggable="true" data-index="${i}">
      <span class="handle" title="拖曳排序">☰</span>
      <span class="seat">${r.seat_no ?? '-'}</span>
      <div class="grow">
        <div class="name">${esc(r.participants?.name || '（找不到姓名）')}${
          r.walk_in ? ' <span class="tag">現場</span>' : ''}</div>
        <div class="sub">
          ${esc(r.ticket_id || '')}${r.checked_in ? '　✅ 已報到' : ''}${r.no_show ? '　✗ 未到' : ''}
        </div>
        <select class="mini-select" data-entry="${i}">
          ${ENTRY_TYPES.map(t =>
            `<option value="${t}" ${r.entry_type === t ? 'selected' : ''}>${t}入場</option>`).join('')}
        </select>
      </div>
      <div class="arrows">
        <button class="small" data-up="${i}" ${i === 0 ? 'disabled' : ''}>⬆</button>
        <button class="small" data-down="${i}" ${i === roster.length - 1 ? 'disabled' : ''}>⬇</button>
      </div>
      <button class="small danger" data-remove="${i}">移除</button>
    </li>`).join('');

  // ⬆⬇ 按鈕
  $$('[data-up]', ul).forEach(b => b.onclick = () => move(+b.dataset.up, -1));
  $$('[data-down]', ul).forEach(b => b.onclick = () => move(+b.dataset.down, +1));
  $$('[data-remove]', ul).forEach(b => b.onclick = () => removeFromSession(+b.dataset.remove));
  // 入場時段：選了就直接存
  $$('[data-entry]', ul).forEach(s => s.onchange = () => changeEntryType(+s.dataset.entry, s.value));

  enableDrag(ul);
}

// 把第 i 個往上(-1)或往下(+1)移一格
function move(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= roster.length) return;
  [roster[i], roster[j]] = [roster[j], roster[i]];   // 兩個互換位置
  renderRoster();
  scheduleRenumber();
}

/* ---------- 修改某個人的入場時段 ---------- */
async function changeEntryType(i, entryType) {
  const r = roster[i];
  const { error } = await sb.from('attendance')
    .update({ entry_type: entryType }).eq('id', r.id);
  if (error) return showError('修改入場時段失敗', error);

  r.entry_type = entryType;
  toast(`${r.participants?.name} → ${entryType}入場`);
}

/* ---------- 電腦版拖曳排序 ---------- */
function enableDrag(ul) {
  let fromIndex = null;

  $$('li[draggable]', ul).forEach(li => {
    li.addEventListener('dragstart', e => {
      fromIndex = +li.dataset.index;
      li.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    li.addEventListener('dragend', () => {
      li.classList.remove('dragging');
      $$('li', ul).forEach(x => x.classList.remove('drag-over'));
    });
    li.addEventListener('dragover', e => { e.preventDefault(); li.classList.add('drag-over'); });
    li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
    li.addEventListener('drop', e => {
      e.preventDefault();
      const toIndex = +li.dataset.index;
      if (fromIndex === null || fromIndex === toIndex) return;
      const [moved] = roster.splice(fromIndex, 1);    // 從原位置拿出來
      roster.splice(toIndex, 0, moved);               // 插到新位置
      renderRoster();
      scheduleRenumber();
    });
  });
}

/* ---------- 自動重新編號 ---------- */
// 連續按 ⬆⬇ 時不要每按一次就連線資料庫，
// 等停手 0.6 秒後再一次寫入（這招叫 debounce）
let renumberTimer = null;
function scheduleRenumber() {
  $('#saveState').textContent = '（順序已改，準備儲存…）';
  clearTimeout(renumberTimer);
  renumberTimer = setTimeout(saveOrder, 600);
}

// 只挑出 attendance 這張表真正有的欄位（把 participants 那包拿掉才能寫回資料庫）
// ⚠️ 這裡一定要列出全部欄位。少列的話，重新編號時那個欄位會被清成預設值。
function pickRow(r) {
  return {
    id: r.id, session_id: r.session_id, participant_id: r.participant_id,
    seat_no: r.seat_no, ticket_id: r.ticket_id,
    checked_in: r.checked_in, checked_in_at: r.checked_in_at,
    entry_type: r.entry_type, no_show: r.no_show, walk_in: r.walk_in,
  };
}

async function saveOrder() {
  if (!roster.length) return;
  $('#saveState').textContent = '（儲存中…）';

  // 為什麼要分兩步？
  // 如果 seat_no 或 ticket_id 有「不可重複」的限制，
  // 直接改會撞到別人現在的號碼。所以先全部搬到不會撞到的暫時值，再改成正確值。
  const temp = roster.map((r, i) => ({
    ...pickRow(r), seat_no: 10000 + i, ticket_id: `TMP-${r.id}`,
  }));
  const { error: e1 } = await sb.from('attendance').upsert(temp);
  if (e1) { $('#saveState').textContent = ''; return showError('重新編號失敗', e1); }

  const final = roster.map((r, i) => ({
    ...pickRow(r), seat_no: i + 1, ticket_id: makeTicket(session.code, i + 1),
  }));
  const { error: e2 } = await sb.from('attendance').upsert(final);
  if (e2) { $('#saveState').textContent = ''; return showError('重新編號失敗', e2); }

  // 更新畫面上的號碼
  roster = roster.map((r, i) => ({ ...r, seat_no: i + 1, ticket_id: final[i].ticket_id }));
  renderRoster();
  $('#saveState').textContent = '（已儲存 ✓）';
  setTimeout(() => { $('#saveState').textContent = ''; }, 2000);
}

/* ---------- 從這場移除某人 ---------- */
async function removeFromSession(i) {
  const r = roster[i];
  if (!confirm(`把「${r.participants?.name}」從這場名單移除？`)) return;

  const { error } = await sb.from('attendance').delete().eq('id', r.id);
  if (error) return showError('移除失敗', error);

  roster.splice(i, 1);
  renderRoster();
  await saveOrder();          // 移除後剩下的人重新編號
  renderPeople();
  toast('已移除');
}

/* ---------- 既有參與者清單 ---------- */
async function loadAllPeople() {
  const { data, error } = await sb.from('participants').select('*').order('name');
  if (error) return showError('讀取參與者失敗', error);
  allPeople = data;
  renderPeople();
}

$('#searchPerson').addEventListener('input', renderPeople);

function renderPeople() {
  const kw = $('#searchPerson').value.trim().toLowerCase();
  const inRoster = new Set(roster.map(r => r.participant_id));

  const list = allPeople
    .filter(p => !inRoster.has(p.id))                                  // 已在名單的不用再顯示
    .filter(p => !kw || (p.name || '').toLowerCase().includes(kw));

  $('#peopleList').innerHTML = list.length
    ? '<ul class="list">' + list.map(p => `
        <li>
          <input type="checkbox" value="${p.id}" style="width:22px;height:22px;flex:none">
          <div class="grow">
            <div class="name">${esc(p.name)}</div>
            <div class="sub">${esc(p.gender || '')} ${esc(p.note || '')}</div>
          </div>
        </li>`).join('') + '</ul>'
    : '<p class="muted">沒有符合的人（或都已經在名單裡了）。</p>';
}

/* ---------- 把勾選的人加入這場 ---------- */
$('#addSelectedBtn').addEventListener('click', async () => {
  const ids = $$('#peopleList input:checked').map(cb => cb.value);
  if (!ids.length) return toast('請先勾選要加入的人', 'err');
  await addParticipants(ids, $('#addEntryType').value);
});

// 共用：把一批 participant_id 接在名單最後面
async function addParticipants(participantIds, entryType = '宣語') {
  const start = roster.length;
  const rows = participantIds.map((pid, k) => ({
    session_id: session.id,
    participant_id: pid,
    seat_no: start + k + 1,
    ticket_id: makeTicket(session.code, start + k + 1),
    checked_in: false,
    entry_type: entryType,
  }));

  const { error } = await sb.from('attendance').insert(rows);
  if (error) return showError('加入失敗', error);

  toast(`已加入 ${rows.length} 人`);
  await loadRoster();
}

/* ---------- 新增一位全新的參與者 ---------- */
$('#newPersonForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#pname').value.trim();
  if (!name) return;

  // 先寫進 participants，再把新的人加入這場
  const { data, error } = await sb.from('participants')
    .insert({ name, gender: $('#pgender').value || null, note: $('#pnote').value.trim() || null })
    .select()
    .single();                        // .select().single() = 回傳剛剛新增的那一筆

  if (error) return showError('新增參與者失敗', error);

  allPeople.push(data);
  await addParticipants([data.id], $('#pEntryType').value);
  $('#newPersonForm').reset();
});

/* ---------- 匯出 CSV ---------- */
$('#exportBtn').addEventListener('click', () => {
  if (!roster.length) return toast('這場還沒有人', 'err');

  // 依 seat_no 由小到大排序（畫面本來就是這個順序，保險再排一次）
  const sorted = [...roster].sort((a, b) => (a.seat_no || 0) - (b.seat_no || 0));

  const rows = [['姓名', 'ticket_id', 'seat_no']];
  sorted.forEach(r => rows.push([r.participants?.name || '', r.ticket_id || '', r.seat_no || '']));

  downloadCSV(`${session.code}_名單.csv`, rows);
  toast('已下載 CSV');
});

/* ---------- 匯入 CSV ---------- */
$('#csvFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const text = await file.text();
  let rows = parseCSV(text);

  // 第一行如果看起來像標題（含「姓名」），就跳過它
  if (rows.length && /姓名|name/i.test(rows[0][0])) rows = rows.slice(1);

  csvRows = rows.map(r => {
    // 第 4 欄的入場時段，寫「攜幼入場」或「攜幼」都認得；沒填就當宣語
    const raw = (r[3] || '').trim();
    const entry = ENTRY_TYPES.find(t => raw.includes(t)) || '宣語';
    return {
      name: (r[0] || '').trim(),
      checked_in: parseYes(r[1]),
      checked_in_at: parseTimeCell(r[2], session.event_date),
      entry_type: entry,
    };
  }).filter(r => r.name);

  $('#csvPreview').innerHTML = `
    <p class="muted">讀到 <b>${csvRows.length}</b> 筆，前 5 筆預覽：</p>
    <div class="scroll-x"><table>
      <tr><th>姓名</th><th>已報到</th><th>報到時間</th><th>入場時段</th></tr>
      ${csvRows.slice(0, 5).map(r => `<tr>
        <td>${esc(r.name)}</td>
        <td>${r.checked_in ? '是' : '否'}</td>
        <td>${r.checked_in_at ? esc(fmtTime(r.checked_in_at)) : '（空白）'}</td>
        <td>${esc(r.entry_type)}</td>
      </tr>`).join('')}
    </table></div>`;

  $('#importBtn').disabled = csvRows.length === 0;
});

$('#importBtn').addEventListener('click', async () => {
  if (!csvRows?.length) return;
  const btn = $('#importBtn');
  btn.disabled = true;
  btn.textContent = '匯入中…';

  try {
    // (1) 需要的話先清空這場名單
    if ($('#replaceAll').checked) {
      const { error } = await sb.from('attendance').delete().eq('session_id', session.id);
      if (error) throw error;
      roster = [];
    }

    // (2) 建立「姓名 → 參與者 id」的對照表
    await loadAllPeople();
    const byName = new Map(allPeople.map(p => [p.name.trim(), p.id]));

    // (3) CSV 裡沒看過的名字 → 一次新增進 participants
    const newNames = [...new Set(csvRows.map(r => r.name).filter(n => !byName.has(n)))];
    if (newNames.length) {
      const { data, error } = await sb.from('participants')
        .insert(newNames.map(name => ({ name }))).select();
      if (error) throw error;
      data.forEach(p => byName.set(p.name.trim(), p.id));
    }

    // (4) 已經在這場名單裡的人不要重複加
    const already = new Set(roster.map(r => r.participant_id));
    const start = roster.length;
    const rows = [];
    let skipped = 0;

    csvRows.forEach((r) => {
      const pid = byName.get(r.name);
      if (already.has(pid)) { skipped++; return; }
      already.add(pid);
      const seat = start + rows.length + 1;
      rows.push({
        session_id: session.id,
        participant_id: pid,
        seat_no: seat,
        ticket_id: makeTicket(session.code, seat),
        checked_in: r.checked_in,
        checked_in_at: r.checked_in ? r.checked_in_at : null,   // 沒報到就不要有時間
        entry_type: r.entry_type,
      });
    });

    if (rows.length) {
      const { error } = await sb.from('attendance').insert(rows);
      if (error) throw error;
    }

    toast(`匯入完成：新增 ${rows.length} 人${skipped ? `，略過重複 ${skipped} 人` : ''}`);
    $('#csvFile').value = '';
    $('#csvPreview').innerHTML = '';
    csvRows = null;
    await loadRoster();
  } catch (err) {
    showError('匯入失敗', err);
  } finally {
    btn.textContent = '開始匯入';
    btn.disabled = true;
  }
});
