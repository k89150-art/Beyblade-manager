# 競賽統計實作與驗證報告

日期：2026-08-29（台灣時間）。本次僅本機實作與驗證，沒有提交、推送、部署或上線。

## 1. 專案與資料來源

- 網站根目錄：`C:\Users\阿傑\OneDrive\文件\戰鬥陀螺管理器`。
- 最新附件：`C:\Users\阿傑\OneDrive\桌面\備份檔\beyblade_x_analysis_database_for_chatgpt_2026-07-30_updated.json`。
- 網站共用主資料庫：`beyblade_x_database_v1_zhTW.json`。新頁面只從其中的 `competitionStatistics` 取統計數值。
- canonical 零件：主資料庫 `blades`、`ratchets`、`bits`、`cx`；別名：`aliases`；相容身分：`__v18`。
- 原裝產品／索引仍由 `stock_products_AUTOFILL_SAFE_2026-07-29-v3.json` 提供，既有 `script.js` 的讀取位置不變。231 筆產品及 `exactByCode`／`variantsByBaseCode` 完全未修改。
- 獨立相容檔 `beyblade_x_codex_database_v1_8_ASCII_SAFE.json` 未修改，統計頁不從它取得數字。
- 開始時沒有競賽統計頁；舊分析頁、分析引擎、庫存推薦器已刪除，本次沒有恢復。

附件仍含舊 Tier／推薦／分析規則，所以不能整份覆蓋已清理的主資料庫。本次將附件的 **整個 competitionStatistics 快照原樣** 放入原主資料庫，而不是建立第二份獨立統計資料庫。快照之外，只補入附件新增的 Glory Valkyrie 身分與日文／英文別名；沒有帶入它的 Tier、角色、推薦或分析資料。

快照擷取時間：`2026-08-28T16:43:18.772Z`（台灣日期 2026-08-29）。Beywatch 公布更新日期為 2026-08-26；MetaBeys 未公布，保留 null。

`competitionStatistics` 的 JSON 內容 SHA-256（JSON.stringify）為：

`bfd46437fe855b424993ae848ff1efbde487892f8a978cae420e8580f86c6595`

測試核對此指紋，確保來源數值、名次、文字與順序沒有被改写。

| 來源 | 資料 | 完整筆數 |
| --- | --- | ---: |
| MetaBeys | 上蓋 | 120 |
| MetaBeys | 固鎖 | 33 |
| MetaBeys | 軸心 | 51 |
| MetaBeys | 輔助戰刃 | 16 |
| Beywatch | 上蓋頁面 | 132 |
| Beywatch | 有統計／有排名／未排名／無統計 | 114／39／75／18 |
| Beywatch | 完整配置 | 945 |
| Beywatch | 固鎖統計 | 486 |
| Beywatch | 軸心統計 | 508 |

目前附件每個上蓋的配置明細最多 10 筆；網站保存並呈現附件的全部 945 筆，不代表另行抓取了來源網站未包含在附件中的資料。超過 10 筆時的展開能力也已實作，並用 14 筆測試資料驗證。

## 2. 新增及修改範圍

新增：

- `competition-stats.html`：兩層頁面、loading／error／搜尋介面、指標說明。
- `competition-stats.css`：四欄／二乘二排行、手機分類與明細頁籤、緊湊列、數字對齊。
- `competition-stats-data.js`：單次載入、名稱索引、來源 slug／canonical 對應、selector、格式化、路由。
- `competition-stats-view.js`：排行、搜尋结果、上蓋摘要、完整配置／固鎖／軸心表格、來源資訊的安全渲染。
- `competition-stats.js`：頁籤、鍵盤搜尋、Hash 路由、返回與展開狀態。
- `scripts/import-competition-statistics.mjs`：明確執行才匯入的白名單工具；不在啟動或 build 自動執行，不匯入舊分析欄位。
- `scripts/build-site.mjs`：本機正式靜態建置及雜湊清單。
- `scripts/serve-site.mjs`：只服務網站公開檔案的本機開發／正式產物預覽。
- `scripts/verify-statistics-browser.mjs`：使用 Browser 技能介面的尺寸、互動與截圖驗證。
- `tests/competition-statistics.test.mjs`：17 項新統計回歸測試。
- `.gitignore`：排除本機建置與截圖產物。
- 本報告。

修改：

- `beyblade_x_database_v1_zhTW.json`：新增完整客觀快照、匯入指紋與一筆新上蓋身分／別名。
- `site-menu.js`／`site-menu.css`：新增「競賽統計」入口，手機導覽五格。
- `home.html`：新增競賽統計連結。
- `about.html`、`admin.html`、`changelog.html`、`contact.html`、`guide.html`、`home.html`、`index.html`、`privacy.html`、`tournament.html`、`user-view.html`：僅同步共用導覽資源版本（home 另有上述入口）。
- `tests/retirement.test.mjs`：仍禁止舊引擎與欄位；只允許新 `competitionStatistics` 來源列的客觀 `rank`。原資料保留測試仍逐筆比對，沒有放寬 Tier／score／推薦規則禁令。

未修改既有收藏、庫存、配置、歷史紀錄、賽事程式與雲端規則。沒有操作使用者雲端資料，也沒有修改既有本機 `exports/`。

## 3. 實際讀取流程與身分處理

`competition-stats.html` → `competition-stats.js` → `loadStatistics()` → 共用主資料庫 → `createStatisticsStore()`。

統計 selector：

- 第一層：`competitionStatistics.metaBeys.categories`。
- 第二層：`competitionStatistics.beywatch.blades`，使用 `bySlug`／`byCanonicalId` 索引，不用陣列位置。
- 搜尋索引初始化一次，涵蓋全部來源頁、既有 canonical 上蓋及 MetaBeys-only 名稱。最終索引 212 個可進入項目，不僅限 39 個有排名上蓋。
- canonical／`__v18` 只用於身分與名稱，不提供統計數字。
- 只有明確的 canonicalId／id／recordId 連結才合併同一身分。共享英文別名本身不構成強制合併依據。
- 來源明確標記 `unmatched` 或 `ambiguous` 時不任選 canonical，不回寫猜測名稱。
- MetaBeys 到 Beywatch 的來源名稱／slug 連結獨立於 canonical，比對失敗不讓整頁崩潰。

例如霜輝銀狼／銀狼的相容層明確包含兩者 ID 關係；現在可統一連到 Silver Wolf 的 Beywatch 頁面。沒有改寫主資料或硬編碼這個上蓋的特殊規則。

## 4. 畫面與互動

第一層：

- 1440 桌面：上蓋、固鎖、軸心、輔助戰刃四欄。
- 1280 桌面與 768 平板：二乘二，避免名字擠壓。
- 375／390／430 手機：一次一類，上方可橫向捲動的頁籤；預設上蓋。
- 每類初始 Top 10，各自獨立展開全部；直接使用來源 `rank`／`popularity`，不重排、不補名次。
- Wheel 只在輔助戰刃分類；沒有 CX 鎖芯／主戰刃排行榜。

第二層：

- 可以點上蓋排行，也可以從搜尋結果進入。
- 桌面顯示上蓋摘要、來源範圍與日期、完整配置全寬表格，以及左右並排的固鎖／軸心表格。
- 手機顯示三個摘要數值，使用「完整配置／固鎖／軸心」頁籤；資料列第一行名稱、第二行帶標籤的數值，不需橫向捲動。
- 所有明細沿用來源順序；沒有任何主觀排序器、用途分類、分數或搭配推論。
- 搜尋支援上下鍵、Enter；頁籤支援左右键、Home、End，具有 aria-selected／aria-controls；手機內容區為 tabpanel。
- 返回後保留分類、展開、搜尋文字，並用 history.state 保存捲動位置；沒有寫入個人儲存區。

可分享路由（符合既有靜態 GitHub Pages 架構）：

- `competition-stats.html`
- `competition-stats.html#/blades/wizard-rod`
- 未對應項目使用來源 slug，例如 `competition-stats.html#/blades/antler`。
- 沒有 Beywatch 頁面的身分使用穩定 canonical 或來源名稱鍵，不使用陣列索引。

## 5. 缺資料、定義與快取

- ranked 顯示來源名次；unranked_or_insufficient_sample 顯示「未排名／樣本不足」；不自行補名次。
- 無統計顯示「目前無可用競賽統計」，摘要 null 顯示「—」，不用原裝配置填補。
- 未對應名稱保留來源英文；Glory Valkyrie 不把待確認中文名稱當成正式中文。
- 來源更新日期 null 顯示「來源未公開更新日期」，不出現 Invalid Date。
- `0.02%` 不捨入成 0%；`1,922` 不誤解析成 1；原始 JSON 值不變。
- 固鎖／軸心的 Top Cuts 缺值顯示「—」，不補 0。
- 所有來源文字經 HTML escaping，URL 只接受 http／https，有效 URL 才產生連結。
- 提供五個來源指標的短說明，保留使用者指定警語：「以上數據依來源網站的統計定義呈現，不等同完整對戰勝率，也不代表本站推薦。」除這段必要警語外，統計畫面沒有將數據稱為勝率。
- `fetch(..., {cache:'no-cache'})` 在每次頁面啟動重新驗證主 JSON；同頁切換共用同一個 promise／索引，不重複抓檔。
- 沒有新增 localStorage、IndexedDB、Service Worker 統計快取或清除動作。既有精準舊分析快取 migration 未修改。

## 6. 自動測試及建置結果

執行：

```powershell
node --test
node --experimental-vm-modules scripts/validate-site.mjs
node scripts/build-site.mjs
git diff --check
```

結果：**29 tests、29 pass、0 fail、0 skipped**。既有 12 項移除／保留資料回歸測試全數通過，加上以下 17 項：

1. 快照指紋及四類全部筆數、來源名次／百分比。
2. Beywatch 132 頁、三種狀態、945／486／508 明細。
3. 只有快照與 Glory Valkyrie 身分新增，既有資料逐值不變。
4. Top 10／全部展開，Wheel 類別限制。
5. 魔導神杖點擊／搜尋，打亂來源陣列仍取到同一頁。
6. 中文、英文、日文、canonicalId、alias 搜尋。
7. 明確相容層 ID 合併與來源連結；共享別名不強制合併。
8. unmatched 來源完整顯示且不改寫身分。
9. ambiguous 不任意選 canonical。
10. 未排名、無資料、canonical-only 上蓋可搜尋。
11. 每筆摘要／配置／固鎖／軸心來源數值與順序。
12. 超過 10 筆展開、缺值、來源配置文字不拆解。
13. 百分比、千分位、日期、URL、HTML escaping。
14. 穩定路由鍵、刷新解析與錯誤編碼。
15. 單次 fetch、錯誤重試、缺少統計資料安全處理。
16. 響應式規則、ARIA、鍵盤、loading／error 元素。
17. 不混合來源，不恢復 Tier／分數／推薦／用途標籤；保留指定警語。

靜態發布檢查：11 份 HTML、12 個 JavaScript 編譯單元、5 份根目錄 JSON、112 個本機參照，PASS。

**本機正式靜態 build 成功**：產生 `.site-build/` 的 28 個網站公開檔案及雜湊清單；對產物實際執行瀏覽器測試。這是同一來源的發布產物，不是第二套統計資料庫；build 不產生／修改任何分析或統計數據。

本次沒有觸發 GitHub Pages 的遠端 Jekyll／部署流程，也未將本機 build 宣稱為線上部署成功。Node VM 的實驗性功能提示與 Git CRLF 提示不影響通過結果。

## 7. 瀏覽器實測與截圖

使用 Browser 技能對真實頁面點擊、填入搜尋、鍵盤操作、重新整理、瀏覽器返回，並讀取實際 DOM 與版面邊界。沒有透過隱藏狀態偽造測試結果。

| 視窗 | 第一層 | 第二層 | 水平溢出／Console errors | 結果 |
| --- | --- | --- | --- | --- |
| 375×812 | 一類 | 一頁籤 | 無／0 | PASS |
| 390×844 | 一類 | 一頁籤 | 無／0 | PASS |
| 430×932 | 一類 | 一頁籤 | 無／0 | PASS |
| 768×1024 | 二乘二 | 全部區塊 | 無／0 | PASS |
| 1280×720 | 二乘二 | 全部區塊 | 無／0 | PASS |
| 1440×900 | 四欄 | 全部區塊 | 無／0 | PASS |

正式建置產物另測 390／430／1440 尺寸與完整搜尋流程，PASS。

實際資料：

- Wizard Rod／魔導神杖：MetaBeys #1、25%；Beywatch #3、Usage 62.2%、1st Rate 35.4%、Top Cuts 5,750；附件中的 10 配置、5 固鎖、5 軸心全部顯示。
- Wheel：輔助戰刃 #1、38%，沒有增加 CX 結構分類。
- Antler：未排名／樣本不足，仍有統計明細。
- Captain America：可以搜尋進入，顯示目前無可用競賽統計。
- Hover Wyvern：保留來源英文名称，可以查看來源統計。
- Silver Wolf／霜輝銀狼／銀狼／SILVER_WOLF：使用資料明確的相容 ID 關係連到同一來源頁。
- Glory Valkyrie／グローリーワルキューレ／GLORY_VALKYRIE：日文與來源英文／ID 搜尋有效，不虛構中文。

截圖位置：`C:\Users\阿傑\OneDrive\文件\戰鬥陀螺管理器\artifacts\competition-stats`。每種尺寸各有 `rankings-尺寸.png` 與 `wizard-尺寸.png`，共 12 張；另有六份尺寸檢查結果 JSON（測試紀錄，不是統計資料庫）。

可重現：

```powershell
node scripts/serve-site.mjs
# 開發預覽 http://127.0.0.1:4328/competition-stats.html
node scripts/serve-site.mjs --production
# 正式產物預覽 http://127.0.0.1:4329/competition-stats.html
```

自動化畫面驗證檔為 `scripts/verify-statistics-browser.mjs`，透過 Browser 技能的 Node 工作階段匯入，在新的 tab 上呼叫 `checkSize({tab, viewport, width, height, base})`；互動流程呼叫 `checkInteractions({tab, base})`。初始 Top 10 檢查使用新分頁，避免把「返回保留的已展開狀態」誤當成首次進入狀態。

## 8. 未變更範圍與發布狀態

- 沒有修改任何零件 Tier，也沒有將排名寫入 tier／score／metaTier。
- 沒有恢復分析、庫存推薦、配置生成、協同分數或原裝加權。
- 原裝產品、使用者收藏／庫存／配置／歷史測試／賽事紀錄及儲存程式完整保留。
- 週六 20:00 與週日 20:00 排程均未修改；沒有呼叫排程變更工具，Git 內工作流程逐字比對通過。
- 沒有新增獨立的統計來源 JSON；唯一來源仍是共用主資料庫中的 competitionStatistics。
- **沒有提交、推送、部署或上線**。目前正式網站仍是先前已上線的移除舊分析版本。
