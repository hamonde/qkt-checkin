/* =========================================================
   session-new.js —— 新增場次頁
   只負責「建立一場新的場次」，建好之後回到場次列表。
   列出、修改、刪除場次在 sessions.js。
   ========================================================= */

(async () => {
  if (!await requireAuth()) return;

  $('#event_date').valueAsDate = new Date();

  // 一邊打 code，一邊預覽票號長怎樣
  $('#code').addEventListener('input', () => {
    $('#ticketPreview').textContent = makeTicket($('#code').value.trim() || '0801', 1);
  });

  bindNoOther($('#noOther'), $('#other_open'));
})();

$('#sessionForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#saveBtn');
  btn.disabled = true;
  btn.textContent = '建立中…';

  const payload = {
    code: $('#code').value.trim(),
    title: $('#title').value.trim() || null,      // 留空就先不填
    event_date: $('#event_date').value,
    xuanyu_deadline: $('#xuanyu_deadline').value || null,
    // 勾了「沒有攜幼時段」就存空值，這場的攜幼／特殊就不判斷時間
    other_open: $('#noOther').checked ? null : ($('#other_open').value || null),
    format: $('#format').value,
  };

  const { error } = await sb.from('sessions').insert(payload);

  if (error) {
    btn.disabled = false;
    btn.textContent = '新增場次';
    return showError('新增場次失敗', error);
  }

  // 建好之後回到場次列表，才看得到剛剛新增的那一場
  toast('已新增場次');
  setTimeout(() => location.href = 'sessions.html', 600);
});
