/* =========================================================
   login.js —— 登入頁的程式
   1) 如果已經登入過，直接跳到場次頁
   2) 送出表單 → 呼叫 Supabase Auth 驗證 email / 密碼
   ========================================================= */

// 一進頁面先看看是不是已經登入了（Supabase 會把登入狀態存在瀏覽器裡）
sb.auth.getSession().then(({ data }) => {
  if (data.session) location.replace('sessions.html');
}).catch(() => { /* 連不上時不處理，交給下面的登入流程給出清楚訊息 */ });

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();                       // 阻止瀏覽器預設的「重新整理送出」

  const btn = $('#loginBtn');
  btn.disabled = true;
  btn.textContent = '登入中…';

  let error = null;
  try {
    ({ error } = await sb.auth.signInWithPassword({
      email: $('#email').value.trim(),
      password: $('#password').value,
    }));
  } catch (err) {
    error = err;                            // 連不上伺服器時會直接拋錯，不是回傳 error
  }

  if (error) {
    btn.disabled = false;
    btn.textContent = '登入';
    $('#hint').innerHTML = loginErrorMessage(error);
    $('#hint').style.color = 'var(--err)';
    return;
  }

  location.replace('sessions.html');        // 成功 → 進入系統
});

// 把 Supabase 的英文錯誤翻成看得懂的說明。
// 最重要的是分辨「密碼錯」和「根本連不到伺服器」這兩件完全不同的事。
function loginErrorMessage(error) {
  const msg = String(error?.message || error);

  // 連不上伺服器：最常見的原因是 Supabase 免費專案閒置太久被自動暫停
  if (/fetch|network|load failed|timeout|connect/i.test(msg)) {
    return '連不上伺服器，這通常不是密碼的問題。<br>' +
           'Supabase 免費專案閒置約一週會自動暫停，請到 ' +
           '<a href="https://supabase.com/dashboard" target="_blank" rel="noopener">Supabase 後台</a>' +
           ' 按「Restore project」把專案喚醒，等幾分鐘再試。';
  }
  if (/invalid login credentials/i.test(msg)) {
    return '帳號或密碼不正確，請再確認一次。';
  }
  if (/email not confirmed/i.test(msg)) {
    return '這個帳號還沒完成驗證。請到 Supabase 後台 Authentication → Users 開啟 Auto Confirm。';
  }
  return '登入失敗：' + esc(msg);
}
