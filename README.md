# 講座報到系統

純 HTML / CSS / JavaScript（不需要 build），資料庫用 Supabase，可以直接放上 GitHub Pages。

## 檔案結構

```
index.html          登入頁（第一頁）
sessions.html       場次頁：新增場次、列出所有場次
roster.html         名單頁：加人、排順序、自動編號、匯出/匯入 CSV
checkin.html        報到頁：大勾選、修改報到時間、全部標記已報到
stats.html          統計頁：每個人累計報到幾場
css/styles.css      全站樣式（手機優先）
js/config.js        ★設定檔：Supabase 網址、金鑰、票號前綴（要改就改這裡）
js/app.js           共用工具：連線、登入檢查、上方選單、時間格式、CSV 處理
js/login.js         登入頁的程式
js/sessions.js      場次頁的程式
js/roster.js        名單頁的程式
js/checkin.js       報到頁的程式
js/stats.js         統計頁的程式
sql/policies.sql    要在 Supabase SQL Editor 執行一次的權限設定
sample-import.csv   匯入用的 CSV 範例
```

每個 HTML 檔最下面都是同樣的載入順序：
**Supabase 函式庫（CDN）→ config.js → app.js → 這一頁自己的 js**。

## 第一次設定（3 個步驟）

### 1. 填入 Supabase 連線資訊

打開 `js/config.js`，把兩行換成你自己的：

```js
const SUPABASE_URL = 'https://xxxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOi....';
```

在 Supabase 後台 → **Project Settings → API**，複製 **Project URL** 和 **anon public** 金鑰。
anon key 放在 GitHub 上是安全的，真正擋人的是下一步的 RLS。

### 2. 設定資料庫權限（很重要）

Supabase 後台 → **SQL Editor** → 貼上 `sql/policies.sql` 整份 → Run。
這會打開 RLS，讓「沒登入的人拿到 anon key 也讀不到資料」，並允許已登入的工作人員讀寫。

### 3. 建立三位工作人員帳號

Supabase 後台 → **Authentication → Users → Add user**，
輸入 email 和密碼，記得把 **Auto Confirm User** 打開（不然要收信驗證）。三個人各建一個。

## 本機測試

因為沒有用到需要 build 的框架，最簡單的方式是直接用瀏覽器打開 `index.html`。

不過瀏覽器對 `file://` 有些限制，建議用一行指令開個小網站伺服器（Mac 內建 Python）：

```bash
cd "/Users/graceting/Downloads/QKT Project" && python3 -m http.server 5173
```

然後在瀏覽器打開 http://localhost:5173

停止伺服器：在終端機按 `Ctrl + C`。

## 推到 GitHub Pages

第一次上傳（在專案資料夾裡執行）：

```bash
git init && git add . && git commit -m "講座報到系統" && git branch -M main
```

到 GitHub 網站上按 **New repository** 建一個新的 repo（不要勾 Add README），
再把下面的網址換成你的 repo 網址後執行：

```bash
git remote add origin https://github.com/你的帳號/你的repo.git && git push -u origin main
```

接著到 GitHub 上的 repo → **Settings → Pages** →
Source 選 **Deploy from a branch**，Branch 選 **main** / **/(root)** → Save。

等一兩分鐘，網址會是：`https://你的帳號.github.io/你的repo/`

之後每次改完檔案，更新網站只要：

```bash
git add . && git commit -m "更新" && git push
```

## 平常怎麼用

1. **場次頁**：新增場次（code 例如 `0801`、日期可以填過去的、總席次）。
2. **名單頁**：選場次 → 從既有參與者勾選加入，或新增全新的人。
   用 ⬆⬇（手機）或拖曳 ☰（電腦）調順序，停手 0.6 秒後自動重新編號：
   座位號變成 1、2、3…，票號同步變成 `XYT-PRE-0801-01`、`-02`…
   按「匯出 CSV」會下載 姓名 / ticket_id / seat_no，可以直接匯進 Canva 做票。
3. **報到頁**：選場次 → 點大方框報到（再點一次取消）。
   已報到的人右邊會出現時間，點它可以手動改、或清空（代表有到但沒有精確時間）。
   上方顯示「已報到 X / 總數 N」。
4. **統計頁**：看每個人累計報到幾場，可搜尋姓名、點名字展開看參加過哪些場次。

## 補登以前辦過的場次

1. 場次頁新增場次時，日期填當時的日期。
2. 名單頁 → 展開「匯入 CSV 建立整場名單」，選檔案 → 開始匯入。
   CSV 欄位順序：`姓名, 已報到(是/否), 報到時間(可空白)`（可參考 `sample-import.csv`）。
   報到時間可寫 `2025-08-01 14:32` 或只寫 `14:32`；留空 = 有到但沒有精確時間。
   系統會依姓名對應既有參與者，找不到的自動新增，統計才會累加到同一個人。
3. 沒有 CSV 的話，也可以在名單頁逐筆手動加人，再到報到頁一個個勾。
4. 整場都有到的話，報到頁按一次「全部標記已報到」就好。

## 常見狀況

**出現 `permission denied for table sessions`（或其他表名）**
→ 這是 GRANT 權限沒開（跟 RLS 無關）。到 Supabase SQL Editor 跑一次 `sql/policies.sql`
最上面的「0) 第一道門：GRANT」那一段。

**登入後看不到任何資料，但沒有錯誤訊息**
→ 這才是 RLS policy 的問題，跑 `sql/policies.sql` 的「1) 打開 RLS」和「2) 允許登入者」兩段。

**登入時說 Invalid login credentials**
→ 帳號沒建立，或建立時沒有 Auto Confirm。到 Authentication → Users 檢查。

**重新編號失敗，說 duplicate key**
→ 資料表裡已經有重複的 seat_no 或 ticket_id。先清掉重複資料再操作。

**匯出的 CSV 用 Excel 打開是亂碼**
→ 程式已經加了 BOM，正常不會亂碼；如果還是有問題，改用 Google 試算表匯入。

**想改票號格式**
→ 改 `js/config.js` 的 `TICKET_PREFIX`，或改 `js/app.js` 裡的 `makeTicket()`。

**畫面卡在空白**
→ 按 F12 打開主控台（Console）看紅色錯誤訊息，通常是 `js/config.js` 的網址或金鑰貼錯。
