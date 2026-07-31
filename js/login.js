/* =========================================================
   login.js —— 登入頁的程式
   1) 如果已經登入過，直接跳到場次頁
   2) 送出表單 → 呼叫 Supabase Auth 驗證 email / 密碼
   ========================================================= */

// 一進頁面先看看是不是已經登入了（Supabase 會把登入狀態存在瀏覽器裡）
sb.auth.getSession().then(({ data }) => {
  if (data.session) location.replace('sessions.html');
});

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();                       // 阻止瀏覽器預設的「重新整理送出」

  const btn = $('#loginBtn');
  btn.disabled = true;
  btn.textContent = '登入中…';

  const { error } = await sb.auth.signInWithPassword({
    email: $('#email').value.trim(),
    password: $('#password').value,
  });

  if (error) {
    btn.disabled = false;
    btn.textContent = '登入';
    $('#hint').textContent = '登入失敗：' + error.message;
    $('#hint').style.color = 'var(--err)';
    return;
  }

  location.replace('sessions.html');        // 成功 → 進入系統
});
