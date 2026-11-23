# 10｜Phase 7-2 收藏與零件管理介面：設計審查

> 狀態：**設計已定案；Phase 7-2a 已在本機實作（未 commit、未部署），7-2b～7-2d 尚未授權**（2026-11-24 使用者確認 10 項決策；最終規格見「第二部分」，技術補強見「第三部分」，7-2a 實作紀錄見 `docs/AI_HANDOFF.md`）。第一部分保留原始審查內容與歷史選項，未採用的選項不得實作。
>
> 原始狀態：審查草案，未實作、未核准（2026-11-24）。只做盤點、提案與風險評估，正式網站程式、Firestore、Rules、Schema、型錄、競賽統計都沒有修改。
> 基準：正式版本 `5c32213`（v1.10.0），本機 `main` = `50169d7`（只多一筆交接紀錄）。D-019（組裝規則）、D-020（導覽）已部署。
> 原型：[`prototypes/collection-parts/index.html`](prototypes/collection-parts/index.html)（假資料、不連 Firebase；可切換 T／P／V／G／Q／S 選項與桌面／手機）。另有一份僅供審查用的私人預覽頁（網址不公開）。
> 本文件所有「`script.js:行號`」都依 `50169d7` 的實際程式確認，不沿用 [02](02-feature-inventory.md) 的舊行號。

標示方式：每項建議都列 **理由／優點／缺點／風險**。標示「選項」的是不同設計方向，**尚未定案，等使用者決定**。

---

## 1. 現有功能盤點

### 1.1 資料文件與分類

- 文件：`users/{uid}/appData/main`。收藏相關欄位：`beybladeTable`（原裝陀螺）、`partTable`（額外零件）、`configTable`（配置）、`historyTable`（拆解紀錄）。
- `beybladeTable` 每筆：`cells`（9 欄：型號、上蓋、紋章鎖、主要戰刃、超越戰刃、金屬戰刃、輔助戰刃、固鎖、軸心）、`mainStockName`，以及 `stockAutoFilled`、`stockRecordId`、`stockProductCode`、`stockSetId`、`stockSetInstanceId`、`stockAssemblySystem`、`stockRatchetMode`（`STOCK_ROW_METADATA_KEYS`，`script.js:2300`）；頁面不認識的欄位會原樣保留（`getStoredItemExtras` `script.js:2317`，D-015）。
- `partTable` 每筆：`cells` = `[類別, 零件名稱, 數量]`。
- `configTable` 每筆：`cells`（同 9 欄）＋`mainStockName`。**配置以「零件名稱文字」引用零件，沒有 ID**。
- **中文／英文名稱**：使用者資料只存中文名稱。英文名稱只在型錄 `beyblade_x_model_chinese_english_2026-08-29.json`，以 `recordId` 對照（`STOCK_NAMES_URL` `script.js:107`），不寫入 Firestore。
- **收藏沒有數量欄位**：同款多顆就是多列；也**沒有加入時間**欄位。

### 1.2 盤點表

| # | 功能 | 程式位置 | 資料來源 | 畫面位置 | Firestore 寫入 |
|---|---|---|---|---|---|
| 1 | 新增收藏：型號自動帶入、即時預覽、Enter 送出 | `addRow` `script.js:2687`、`renderStockAutoPreview` `3356`、`parseStockProductCode` `3186` | 型錄 JSON（`STOCK_PRODUCTS_URL` `106`） | `#collectionSection` 上方表單（`#model` `index.html:300`） | 是：`saveData()` |
| 2 | 共用型號候選（BX-00／CX-00）、全部加入 | `openStockProductChoice` `3590`、`#stockChoiceDialog` `index.html:549` | 型錄 | 對話框 | 是（選定後） |
| 3 | 套組一次加入（UX-21 等，共用 `stockSetInstanceId`） | `addAutoFilledStockProducts` `3564`、`createStockSetInstanceId` `3557` | 型錄 | 同上 | 是 |
| 4 | 手動輸入收藏（BX/UX、CX 分件；D-019 規則） | `addManualStockRow` `2560`、`validateRatchetRules` `418`、`assembly-rules.js` | 使用者輸入 | 收藏表單「手動輸入」模式 | 是 |
| 5 | 刪除收藏（套組一起刪除確認） | `deleteRow` `1040`（`beybladeTable` 分支） | DOM 列 | 每列「刪除」 | 是 |
| 6 | 修改收藏 | **不可用**：`getOperationButtons("beyblade")` 只產生「刪除」（`script.js:659`） | — | — | — |
| 7 | 收藏排序（UX→BX→CX→型號） | `sortTable` `507`、`sortBeybladeTable` `533`；**`collectCurrentData` 每次儲存前都會重排 DOM**（`1600`） | DOM 列 | 固定順序，使用者不能選 | 間接（順序是資料的一部分） |
| 8 | 收藏搜尋／篩選 | **沒有** | — | — | — |
| 9 | 收藏卡片（標題、零件徽章、CX 分組） | `updateResponsiveTableCells` `2982`、`getCollectionCardParts` `2936`；標題用 CSS `::after { content: attr(data-card-title) }`（`style.css:921`） | DOM 列 | 收藏表格以 CSS 呈現為卡片 | 否 |
| 10 | 收藏詳細資訊 | **沒有獨立詳細畫面**；卡片即全部資訊 | — | — | — |
| 11 | D-015 型錄升級（只升級明確標記自動帶入的列） | `isExplicitStockAutoFilled` `2313`、`chooseStockProductForStoredItem` `3507`、`upgradeStoredStockItem` `3525` | 型錄＋讀入資料 | 背景 | **讀入時不寫**；下次使用者儲存才帶出 |
| 12 | 收藏數量 | `#collectionCount` = 列數（`updateUiSummaries` `2883`） | DOM | 區段標題膠囊 | 否 |
| 13 | 新增額外零件（8 類、數量正整數） | `addPart` `2773`；`#partType`／`#partName`／`#partCount`（`index.html:372-384`） | 使用者輸入 | `#inventorySection` 表單 | 是 |
| 14 | 修改額外零件（行內，可改名稱與數量） | `editRow` `1104`、`saveEditRow` `1189`、`cancelEditRow` `1260` | DOM 列 | 每列「修改」 | 是 |
| 15 | 刪除額外零件 | `deleteRow` `1040`（`partTable` 分支），**不檢查配置是否使用** | DOM 列 | 每列「刪除」 | 是 |
| 16 | 零件搜尋、類別篩選（全部／上蓋／固鎖／軸心／CX 分件） | `applyInventoryFilters` `2960`：以 `row.hidden` 隱藏、以 CSS `order` 排序，**不搬動 DOM** | DOM 列 | `#inventorySearchInput`、`data-inventory-filter` | 否 |
| 17 | 庫存摘要：種類、持有總數、使用中、可用 | `updateUiSummaries` `2883`；「使用中」= Σ min(額外數量, 配置引用) | DOM（`partTable`＋`configTable`） | `#inventorySection` 摘要列 | 否 |
| 18 | 總持有計算（原裝＋額外；CX 上蓋不計） | `getTotalParts` `2813` | `beybladeTable`＋`partTable` | 配置選單剩餘數量 | 否 |
| 19 | 配置引用計算 | `getUsedParts` `2857`（依名稱比對） | `configTable` | 同上 | 否 |
| 20 | 自訂配置：建立／修改（Quick Editor，D-019） | `openConfigQuickEditor` `3756`、`addConfig` `3869`、`checkStock` `3852`、`refreshSelectors` `3806` | 選項來自 `getTotalParts`－`getUsedParts` | `#configSection`、`#configQuickEditor` | 是 |
| 21 | 刪除配置並記錄原因 | `askDeleteReasonForConfig` `881` | DOM | 配置 ⋯ 選單 | 是 |
| 22 | 儲存（D-018 逐表交易、衝突、結果不明確認） | `saveData` `1995`、`submitCollectionSave` `1921`、`collection-sync.js` | `collectCurrentData()` 從 DOM 收集 | 同步列、版本列 | 是（唯一寫入點） |
| 23 | 有遠端更新時：畫面乾淨才套用 | `applyCollectionRemoteWhenClean` `1747`、`hasUnsavedDomInteraction` `167` | 快照 | — | 否 |
| 24 | F-04 草稿：登出／換帳號時保留未儲存資料、只給原帳號看 | `captureOrphanedCollectionDraft` `2125`、`isDraftOwner` `2154` | DOM | `#collectionDraftNotice` | 否（只在記憶體） |
| 25 | 導覽與快速新增（D-020） | `site-menu.js`：`#add-collection` → 收藏區段並聚焦 `#model`；`#add-part` → 零件區段並聚焦 `#partName` | — | 底部「收藏」「＋新增」、側欄「收藏」「零件」 | 否 |

### 1.3 手機與桌面目前的入口

- 手機：底部「收藏」（收藏與零件區段都亮起）、「＋新增」→ 新增收藏／新增零件；側欄「收藏」「零件」。收藏與零件是**同一頁上下兩個區段**，以捲動切換。
- 桌面：左側欄同上，上方有「新增」按鈕。收藏、零件、配置、拆解紀錄四個區段由上而下排列。

---

## 2. 關鍵程式依賴（決定哪些改動安全）

這一節是整份審查的核心。下列事實都已逐行確認：

1. **DOM 表格就是資料來源**。`getTableData`（`script.js:1567`）以 `getPersistedRowCells`（`618`）讀取**每一列除最後一格外所有儲存格的 `innerText`**；`partTable`／`configTable` 只保留 `cells`／`mainStockName`，`beybladeTable` 另外保留 metadata 與未知欄位。
   - ⇒ 在資料儲存格（非最後一格）裡**加入任何文字元素**，該文字就會被存進 Firestore。
   - ⇒ `innerText` 受 CSS 影響：若對資料儲存格套用 `text-transform`，或在儲存格內放入被 CSS 隱藏的子元素，存檔內容會改變。目前 `style.css` 沒有 `text-transform`，卡片標題用 `::after` 顯示（偽元素不進 `innerText`），所以安全。
   - ⇒ 現有卡片的零件徽章放在**最後一格（操作格）**、配置卡片的摘要以 `div` 插在 `<tr>` 開頭（不是儲存格），都不會被存。新 UI 必須沿用這個規則。
2. **主要戰刃格的顯示值不等於儲存值**：分件 CX（金屬＋超越）顯示「超越/金屬」，但 `dataset.stockName` 為空字串（`getStockProductRowData` `3465`）。新卡片若重建儲存格，必須保留 `data-stock-name`。
3. **列的順序是資料**。`fingerprintTable`（`collection-sync.js:74`）以 JSON 比對整個陣列，**順序不同就視為有修改**，下次 `saveData()` 會寫入。
   - `beybladeTable`：儲存前一定重排，但同型號多顆的相對順序由 DOM 決定；若 UI 搬動 DOM，可能交換兩顆同款陀螺的順序 → 產生寫入。
   - `partTable`：不重排，DOM 順序＝新增順序。現行篩選刻意用 CSS `order`，不搬 DOM。
   - ⇒ **任何使用者排序、分組，只能用 CSS `order` 或另建檢視層，絕不能搬動原始 `<tr>`。**
4. **隱藏不影響收集**：`querySelectorAll("tbody tr")` 包含 `hidden` 的列；`display:none` 時 `innerText` 等於 `textContent`（儲存格只有純文字，結果相同）。⇒ 分頁切換用 `hidden`／`display:none` 不會漏存。**不可**把列移出表格或從 DOM 移除來「隱藏」。
5. **刪除、修改都以「按鈕所在的 `<tr>`」定位**（`deleteRow(button)` 用 `button.closest("tr")`）。若在表格外另建卡片，按鈕必須轉呼叫原列內的按鈕（或傳入原列），不能另寫刪除邏輯。
6. **編輯中的狀態判斷**：`hasUnsavedDomInteraction`（`167`）只認得 `.editing-row`、Quick Editor、刪除配置對話框、型號候選對話框。新增的任何編輯面板（例如零件詳細面板內的修改）**必須讓這個函式知道**，否則遠端更新可能在使用者編輯時套用、F-04 草稿也不會標示「編輯器開啟中」。
7. **D-019 只在既有入口檢查**：手動收藏經 `addManualStockRow`、配置經 `addConfig`／`saveConfigEditRow`。新 UI 只能呼叫這些函式，不能自己組 `cells` 寫入表格。
8. **D-020 契約**：測試（`tests/site-navigation.test.mjs`）要求 `index.html` 保有 `id="model"`、`id="partName"`、`id="historySection"`，`#add-collection`、`#add-part`、`#inventorySection` 的行為不變。

---

## 3. Phase 7-2 設計提案

以 A 工作台風格（清單＋右側詳細面板，高密度）為基礎。原型可切換下列選項比較。

### 3.1 收藏與零件如何分頁 — **選項 T（待決定）**

| | T1：同一區段內分頁（原裝陀螺｜零件） | T2：維持上下兩區段，頂部加分段錨點 |
|---|---|---|
| 做法 | `#collectionSection` 頂部加分頁列；`#inventorySection` 仍是獨立 `<section>`（保留 id），未選中時 `hidden` | 不改區段結構，只加固定的「原裝陀螺／零件」切換，點擊捲動到對應區段 |
| 理由 | 與 Phase 7 決策「庫存併入收藏『零件』分頁」一致 | 最小改動 |
| 優點 | 手機一次只看一種清單，不用長捲動；與側欄「收藏＞零件」一致 | 幾乎沒有行為風險；現有測試與 hash 不變 |
| 缺點 | 需處理 `#inventorySection`、`#add-part` 自動切到零件分頁；桌面看不到兩者同時 | 手機仍需長捲動；沒有真正落實「分頁」決策 |
| 風險 | 低：只用 `hidden`，表格不移出 DOM（見 §2-4）；需新增測試確認切換分頁前後 `collectCurrentData()` 完全相同 | 極低 |

### 3.2 「零件」分頁顯示什麼 — **選項 P（待決定）**

| | P1：只列額外零件（現況 `partTable`） | P2：列出所有持有零件（原裝＋額外），額外部分可編輯 |
|---|---|---|
| 做法 | 現有清單換新外觀，每列加「配置引用」「可用」 | 由 `getTotalParts` 的同一套規則算出每個零件：原裝 n、額外 n、配置引用 n、可用 n；只有「額外」數字對應 `partTable` 的列可修改／刪除 |
| 理由 | 與資料表一對一，最好理解「我改的是哪一筆」 | 符合 08 的「持有／引用／可用三個數字分開」；使用者真正想知道的是「這個零件我總共有幾個、還能用幾個」 |
| 優點 | 簡單、無衍生計算的誤解 | 一眼看出原裝陀螺裡拆出來的零件；配置時的可用數量和這裡一致 |
| 缺點 | 原裝陀螺內的零件不在這裡，可用數量與配置選單不一致（配置選單算原裝＋額外） | 需要清楚標示「原裝數量要在原裝陀螺分頁改」，否則使用者會以為可以直接改 |
| 風險 | 低 | 中低：純讀取計算（第 2 類），但若計算規則與 `getTotalParts` 不一致會誤導；必須直接呼叫 `getTotalParts`／`getUsedParts`，不另寫一套 |

### 3.3 桌面版配置（列表、卡片、詳細資訊）

- 三欄：左側既有側欄｜中間清單｜右側詳細面板（寬約 340px）。
- 清單有兩種密度 — **選項 V（待決定）**：
  - V1 清單（表格式高密度，一列一顆）：大量收藏時最好掃描。
  - V2 卡片格：視覺較好，一屏較少。
  - 建議提供切換，偏好只存 localStorage（允許的 UI 偏好）。理由：收藏數量差異大。缺點：多一種狀態要測。風險：低（純 UI）。
- 詳細面板（點選一列後）：
  - 原裝陀螺：型號、中文名、英文名（有 `recordId` 才顯示，來自型錄）、零件分組、資料來源（自動帶入／手動輸入，D-015 說明）、套組成員、「被哪些配置使用」、刪除。
  - 零件：類別、名稱、原裝／額外／配置引用／可用、引用此零件的配置清單、修改數量、刪除。
- 詳細面板**只讀取原列**，操作按鈕轉呼叫原列的既有按鈕（§2-5）。

### 3.4 手機版

- 頂部：分頁（原裝陀螺｜零件）＋搜尋框；篩選以可橫向捲動的 chip；排序收在「排序」底部 sheet。
- 清單為精簡卡片：標題（型號＋名稱）、一行零件徽章、右側數字（零件分頁顯示「可用 / 持有」）。
- 點卡片開啟**底部 sheet** 詳細資訊（代替桌面右側面板），sheet 內才有修改／刪除，降低誤觸。
- 觸控區 ≥ 44px（`--ui-touch`），無水平捲動。

### 3.5 搜尋、篩選、排序

| | 原裝陀螺 | 零件 |
|---|---|---|
| 搜尋 | 型號、中文名稱、零件名稱；英文名稱 — **選項 S（待決定）**：只有自動帶入（有 `recordId`）的列才能搜到英文名，手動列不行 | 名稱、類別 |
| 篩選 | 系列（BX／UX／CX）、來源（自動帶入／手動） | 類別（全部／上蓋／固鎖／軸心／CX 分件，現況）＋狀態（可用 >0／已全用／超用） |
| 排序 | 預設（UX→BX→CX，現況）、型號、名稱 | 預設（類別，現況）、名稱、可用數量 |

- **實作限制**：排序一律以 CSS `order`，篩選以 `hidden`，不搬 DOM（§2-3）。「最近加入」排序**無法提供**（沒有加入時間欄位，屬 Schema 變更）。
- 理由：沿用 `applyInventoryFilters` 已驗證的安全做法。優點：不會產生意外寫入。缺點：鍵盤 Tab 順序仍依 DOM 順序（CSS `order` 不改焦點順序），需在列上提供方向鍵移動或接受此限制。風險：低。

### 3.6 銜接 Phase 7-1 快速新增

- `#add-collection`：切到「原裝陀螺」分頁 → 展開新增面板 → 聚焦 `#model`（現行為加上分頁切換）。
- `#add-part`：切到「零件」分頁 → 聚焦 `#partName`。
- 新增表單位置 — **選項 Q（待決定）**：
  - Q1 清單上方可收合面板（保持現在的 DOM 位置與 id）。優點：零風險、手機可直接看到結果。缺點：佔空間。
  - Q2 底部 sheet／對話框。優點：清單乾淨。缺點：要把 `#model`、`#partName` 搬進對話框（id 不變），且對話框開啟時應被 `hasUnsavedDomInteraction` 視為編輯中（現在輸入到一半的表單不算未儲存，需決定是否沿用）。風險：中低。
- D-020 的五項選單內容、hash 名稱都不改。

### 3.7 三種數量如何區分

| 數字 | 定義（沿用現行計算） | 顯示位置 |
|---|---|---|
| 收藏數量 | `beybladeTable` 列數（同款多顆＝多列） | 原裝陀螺分頁標題「n 顆」 |
| 額外零件數量 | `partTable` 的數量欄加總 | 零件分頁「額外 n」 |
| 原裝內含 | `getTotalParts` 中來自原裝陀螺的部分（CX 上蓋不計） | P2 才顯示 |
| 配置引用 | `getUsedParts`（依名稱比對） | 零件列與詳細面板 |
| 可用 | 持有（原裝＋額外）－ 配置引用；小於 0 標示「超用 n」 | 零件列主數字 |

- 同款多顆的顯示 — **選項 G（待決定）**：G1 合併成一張卡「×2」，詳細面板列出每一顆可個別刪除；G2 維持一顆一張（現況）。G1 優點：清單短；缺點與風險（中）：刪除時必須明確對應到「哪一列」，套組（`stockSetInstanceId`）要一起顯示，不能把兩列合成一筆資料。
- 現行摘要「使用中」= Σ min(額外, 引用)，只算額外零件；新介面若改為「配置引用」需改標籤，**不可沿用同名但不同定義** — 待決定（§7）。

### 3.8 刪除或修改被引用的零件

- 刪除額外零件、刪除原裝陀螺、把零件數量改小、把零件改名時，先計算「這次變更後持有量會低於引用量」的配置，於確認對話框列出（最多 5 筆＋「等 n 個配置」）。
- **只提示，不阻擋，也不自動修改配置**（配置以文字引用，改名不會連動；這是現況）。
- 理由：目前刪除完全沒有提示（盤點 #15），使用者可能不小心讓配置「超用」。優點：純讀取計算。缺點：確認文字變長。風險：低；確認文案改變需同步更新測試。

---

## 4. 現有功能 ↔ 新介面逐項對照

| 現有功能（§1.2 #） | 新介面位置 | 分類 |
|---|---|---|
| 1–4 新增收藏（自動、候選、套組、手動） | 原裝陀螺分頁新增面板（Q1/Q2）；呼叫同一 `addRow`／`addManualStockRow` | 1 純 UI（位置／外觀） |
| 5 刪除收藏 | 詳細面板／sheet 的「刪除」，轉呼叫原列按鈕；加引用提示 | 1＋2（提示計算） |
| 6 修改收藏 | **維持不可用**。重新開放屬儲存流程與 D-015 標記問題 | 3（不實作） |
| 7 排序 | 預設不變；使用者排序以 CSS `order` | 1 |
| 8 搜尋／篩選（新） | 原裝陀螺分頁頂部 | 1（英文名搜尋為 2） |
| 9 卡片 | 新卡片／清單外觀 | 1 |
| 10 詳細資訊（新） | 桌面右側面板、手機 sheet | 2（讀取原列＋型錄＋引用） |
| 11 D-015 升級 | 不變；詳細面板顯示來源 | 1 |
| 12 收藏數量 | 分頁標題；G1 時顯示「×n」 | 1／2 |
| 13 新增零件 | 零件分頁新增面板 | 1 |
| 14 修改零件 | 詳細面板／sheet；仍用 `editRow`→`saveEditRow` 或同等轉呼叫 | 1＋**需處理 `hasUnsavedDomInteraction`**（2） |
| 15 刪除零件 | 詳細面板；加引用提示 | 1＋2 |
| 16 零件搜尋篩選 | 保留，加狀態篩選與排序 | 1＋2 |
| 17 庫存摘要 | 零件分頁頂部；「使用中」定義待決定 | 2 |
| 18–19 持有／引用計算 | 不變，由新畫面讀取 | 2 |
| 20–21 配置 | 不在本階段範圍；只顯示引用 | — |
| 22–24 儲存、遠端套用、F-04 | **完全不變** | — |
| 25 導覽 | hash 加分頁切換；D-020 內容不變 | 1 |

---

## 5. 資料流與 Firestore 寫入風險分析

### 5.1 資料流（不變）

```
Firestore 快照 → applyDataToTables（建立 <tr>，D-015 升級只在記憶體）
             → 使用者操作（addRow／addPart／deleteRow／saveEditRow／addConfig…）
             → saveData() → collectCurrentData()（從 DOM 讀取）
             → collection-sync 逐表比對指紋 → 只寫有變更的表（D-018 交易）
```

新 UI 只能位於「DOM 表格」與「使用者」之間，不得新增第二條寫入路徑。

### 5.2 風險清單

| 風險 | 情境 | 後果 | 防護（實作時必須做） |
|---|---|---|---|
| R-1 漏存 | 為了分頁或卡片，把列移出 `<table>` 或從 DOM 移除 | 該列從資料消失，下次儲存**刪除雲端資料** | 只用 `hidden`；測試：切換分頁、篩選前後 `collectCurrentData()` 深度相等 |
| R-2 錯存 | 在資料儲存格內加入文字元素、或套用 `text-transform` | 顯示文字被寫回 `cells`，破壞名稱與型號 | 新元素只放操作格或 `<tr>` 外；測試：渲染新 UI 後 `getTableData` 與輸入資料完全相同 |
| R-3 意外寫入 | 排序或分組搬動 `<tr>` | 順序改變 → 指紋不同 → 寫入（內容沒變但產生寫入，並可能與其他裝置衝突） | 只用 CSS `order`；測試：所有 UI 操作後 DOM 順序不變 |
| R-4 主要戰刃名稱遺失 | 重建儲存格時沒保留 `data-stock-name` | 分件 CX 的 `mainStockName` 被改成顯示文字 | 不重建儲存格；若必須，測試覆蓋分件 CX |
| R-5 繞過 D-019 | 新增面板自行組 `cells` 插入表格 | 官方禁止組合被存入 | 只呼叫 `addManualStockRow`／`addConfig` |
| R-6 繞過 D-015 | 開放修改收藏或「重新帶入」 | 手動內容被型錄覆蓋、`stockAutoFilled` 標記錯誤 | 本階段不開放修改收藏 |
| R-7 遠端更新蓋掉編輯 | 新的零件編輯面板不在 `hasUnsavedDomInteraction` 內 | 其他裝置更新時，編輯中的內容被套用的快照取代；F-04 草稿少標示 | 新編輯面板必須加入判斷；加測試（**更正**：R2 定案後，零件編輯一律讓原始列進入既有 `.editing-row` 狀態，判斷自然成立；純檢視不列入，見第二部分 §F） |
| R-8 刪錯列 | G1 合併卡片刪除時對應錯誤 | 刪到另一顆同款陀螺（套組可能一起被刪） | 刪除一律轉呼叫原列按鈕；套組沿用現有確認 |
| R-9 D-020 破壞 | 改 id、hash 或移除 `#inventorySection` | 快速新增失效 | 保留 id；`site-navigation.test.mjs` 必須通過 |

### 5.3 改動分類

1. **純 UI 修改**：分頁殼（T1/T2）、卡片／清單外觀、詳細面板版面、手機 sheet、篩選 chip、排序（CSS `order`）、搜尋（`hidden`）、空狀態、`--ui-*` tokens、新增面板收合。
2. **需要修改資料讀取或畫面轉換**：零件三數字與 P2 合併檢視、引用此零件的配置清單、刪除／改名的影響提示、英文名搜尋（型錄對照）、G1 同款合併顯示、詳細面板讀取原列、hash → 分頁、`hasUnsavedDomInteraction` 納入新面板、摘要「使用中」定義。
3. **需要修改儲存流程或 Schema（本階段不實作）**：收藏數量欄位、加入時間（「最近加入」排序）、零件 ID 與配置改用 ID 引用（改名連動）、重新開放修改收藏、零件備註／照片、把 DOM 表格改為記憶體資料模型。

### 5.4 渲染架構 — **選項 R（待決定）**

| | R1：繼續以 CSS 改造現有 `<tr>` | R2：表格保留為資料來源（畫面上隱藏），另建檢視層 |
|---|---|---|
| 理由 | 現行卡片就是這樣做，已在正式環境驗證 | 詳細面板、合併卡片、P2 合併零件很難只用 CSS 達成 |
| 優點 | 寫入風險最低；`deleteRow(button)` 等原樣可用 | 版面自由度高；檢視層可做成純函式並單元測試 |
| 缺點 | 版面受表格結構限制；P2、G1 幾乎做不到 | 兩份 DOM 需同步（可用既有 `installUiSummaryObservers` 的 MutationObserver 模式）；操作需轉呼叫原列 |
| 風險 | 低 | 中：同步遺漏會顯示過時資料；但只要不碰原表格，**不會造成錯存**（檢視層不被 `getTableData` 讀取） |

不採用：R3 改成記憶體資料模型（屬第 3 類）。

---

## 6. 預計修改的檔案（若核准）

| 檔案 | 內容 | 不修改的部分 |
|---|---|---|
| `index.html` | 分頁列、搜尋／篩選／排序控制、詳細面板容器；版本字串 | 不改 `#model`、`#partName`、`#inventorySection` 等 id，不刪表格 |
| `style.css` | 新版面、卡片、sheet、清單密度 | 不對資料儲存格用 `text-transform`、不隱藏儲存格內文字 |
| `script.js` | UI 區塊：`updateResponsiveTableCells`、`applyInventoryFilters` 擴充、分頁與詳細面板、`hasUnsavedDomInteraction` 納入新面板、刪除提示文字 | **不改** D-018 區段（`/* ===== D-018 collection saves */`）、`saveData`、`getTableData`、`collectCurrentData`、`applyDataToTables`、D-015 函式、`assembly-rules.js` |
| `collection-view.js`（新，R2 時） | 純函式：零件數量彙整、篩選、排序鍵、刪除影響計算 | 無 DOM、無 Firebase |
| `site-menu.js` | 只在需要時讓 `#add-part`／`#inventorySection` 觸發分頁切換（或由 `script.js` 監聽 hash） | D-020 選單內容、版本外的導覽結構 |
| `tests/collection-view.test.mjs`（新）等 | 見 §7 驗收 | — |
| `guide.html`、`changelog.html`、文件 | 說明更新 | — |

不碰：`collection-sync.js`、`tournament*.js`、`firebase` 設定與 Rules、型錄 JSON、`competition-stats*`、`data/` 統計。

---

## 7. 建議實作階段與驗收條件

每階段一個本機 commit，部署另行授權。

| 階段 | 內容 | 驗收條件 |
|---|---|---|
| 7-2a 分頁殼 | T 選項；hash 與快速新增切換分頁；Q 選項 | 全部測試通過；新測試：切換分頁前後 `collectCurrentData()` 深度相等、DOM 列順序不變；`#add-collection`／`#add-part` 聚焦正確；D-020 測試通過；390／768／1440 × 深色／米色無 overflow |
| 7-2b 搜尋篩選排序 | 原裝陀螺與零件的搜尋、篩選、排序 | 新測試：任何篩選／排序組合後 `getTableData` 結果與順序不變；不呼叫 `saveData` |
| 7-2c 數量與引用 | 三數字、引用清單、刪除／改名影響提示（P 選項） | 數量函式以測試對照 `getTotalParts`／`getUsedParts` 的結果（含 CX 上蓋不計、分件 CX、套組）；提示只出現在確認文字，取消時不寫入 |
| 7-2d 詳細面板與手機 sheet | R、V、G 選項 | ~~新面板開啟時 `hasUnsavedDomInteraction()` 為 true~~（**2026-11-24 更正**：純檢視不算編輯，見第二部分 §F）；刪除轉呼叫原列（含套組）測試；D-015／D-018／F-04 既有測試全數通過；D-018 區段雜湊不變 |
| 驗收（各階段共通） | — | `node --test`（13＋新檔）全過、validate、build、`git diff --check`；本機預覽 Console Error 0；登入後操作需使用者或 Emulator 驗證，未驗證者不得標示通過 |

---

## 8. 尚待使用者決定的事項

| # | 事項 | 選項 | 建議（僅供參考，未定案） |
|---|---|---|---|
| 1 | 收藏與零件分頁方式 | T1 分頁／T2 上下區段＋錨點 | T1（符合既有決策），但需 7-2a 測試先行 |
| 2 | 零件分頁內容 | P1 只額外／P2 全部持有 | P2 較符合「三數字」決策；P1 風險最低 |
| 3 | 渲染架構 | R1 CSS 改造／R2 檢視層 | 若選 P2 或 G1，實務上需要 R2 |
| 4 | 桌面清單密度 | V1 清單／V2 卡片／提供切換 | 提供切換 |
| 5 | 同款多顆 | G1 合併「×n」／G2 一顆一張 | 待決定（G1 有刪錯列風險） |
| 6 | 新增表單位置 | Q1 可收合面板／Q2 sheet | Q1 |
| 7 | 英文名搜尋 | 只限自動帶入列／不提供 | 待決定 |
| 8 | 摘要「使用中」 | 保留現義並改名／改成「配置引用」 | 待決定（兩者數字不同） |
| 9 | 刪除影響提示 | 只提示（建議）／阻擋 | 只提示 |
| 10 | 是否加入「用此陀螺建立配置」 | 加入／不加入 | 屬新功能，08 曾列為提案，需明確核准 |

## 9. 未驗證事項

- 原型只用假資料，沒有連接 Firebase，也沒有執行正式程式；上表風險與防護是依程式閱讀推論，**尚未以測試證實**。
- 登入後的新增、刪除、編輯流程未在本階段操作。
- 同款多顆實際資料量、使用者收藏規模未統計（未讀取正式資料）。


---

# 第二部分：最終設計規格（2026-11-24 定案）

> **設計已定案，實作尚未授權。** 本部分不代表任何程式已修改或任何測試已通過。第一部分的選項比較保留作歷史紀錄；未採用的選項（T2、P1、R1、V1／V2 單一密度、G1、Q2、S2、U1、阻擋式刪除、N1）不得實作。
> 程式依據重新以 `50169d7` 確認；本部分新增的程式事實都附行號。

## A. 最終決策表

| 代號 | 決策 | 內容 | 未採用 |
|---|---|---|---|
| T1 | 真正分頁 | 收藏頁頂部「原裝陀螺｜零件」分頁，一次只顯示一個分頁 | T2 上下區段 |
| P2 | 全部持有零件 | 零件分頁列出原裝內含與額外持有的所有零件，每種顯示四個數字 | P1 只列額外 |
| R2 | 原始表格＋獨立顯示層 | `beybladeTable`、`partTable` 留在 DOM 作為唯一儲存來源（畫面上隱藏）；另建顯示層讀取並呈現 | R1 CSS 改造 |
| V3 | 桌面可切換 | 桌面版提供「清單／卡片」切換，偏好只存 localStorage；手機固定卡片 | 單一密度 |
| G2 | 一顆一張 | 同款多顆不合併，各自一張卡片／一列 | G1 合併 ×n |
| Q1 | 清單上方可收合面板 | 新增收藏、新增零件表單在各分頁清單上方，可收合；`#model`、`#partName` 等 id 不變 | Q2 sheet |
| S1 | 英文名搜尋（限可靠對照） | 只有能由 `stockRecordId` 在型錄英文名對照檔找到的收藏，才以英文名比對 | S2 不提供 |
| U2 | 摘要改為「配置引用」 | 摘要不再顯示「使用中」；新數字明確命名為「配置引用」，不沿用舊數值 | U1 保留舊義 |
| D1 | 只提示 | 刪除、減量、改名時列出影響，不阻擋、不自動修改配置；取消時不寫入 | 阻擋 |
| N2 | 不加入 | 本階段不新增「用此陀螺建立配置」 | N1 加入 |

範圍提醒：本階段只改收藏與零件。`configTable`、`historyTable` 維持現有畫面，只被顯示層讀取（計算配置引用）。

## B. 最終介面規格

### B.1 共通結構（`index.html`）

```
<main>
  [既有] 同步列、版本列「收藏儲存版本：5B（交易保護）」、F-04 草稿提示（不變）
  <section id="collectionSection">            ← 分頁「原裝陀螺」（id 不變）
     分頁列（role=tablist）：原裝陀螺 n｜零件 n
     Q1 新增收藏面板（內含既有 #model、手動輸入欄位、預覽）
     工具列：搜尋、系列 chip、來源、排序、（桌面）清單／卡片切換、筆數
     顯示層清單（view）
  </section>
  <section id="inventorySection">             ← 分頁「零件」（id 不變）
     分頁列（同上）
     Q1 新增零件面板（內含既有 #partType、#partName、#partCount）
     摘要（U2）、工具列、顯示層清單、無對應引用區塊
  </section>
  桌面：右側詳細面板（兩分頁共用）｜手機：底部 sheet
  <div id="collectionSourceTables" class="source-tables" aria-hidden="true" inert>
     既有 <table id="beybladeTable">、<table id="partTable">（標記與欄位完全不變）
  </div>
  [既有] #configSection、#historySection（不變）
</main>
```

- 兩張原始表格在 **HTML 原始碼中**移入 `#collectionSourceTables`（作者時的結構調整，不是執行期搬動 `<tr>`）。這個容器**不會**因分頁切換而隱藏，避免 `display:none` 影響 `innerText`（見 §K-1）。
- （第三部分 P-1 已實測並限定隱藏寫法）容器以「視覺隱藏」方式處理（`position:absolute; width:1px; height:1px; overflow:hidden; clip-path: inset(50%)`，仍屬於已渲染元素），加 `aria-hidden="true"` 與 `inert`，避免鍵盤與螢幕閱讀器進入。
- 分頁切換只對 `#collectionSection`／`#inventorySection` 設定 `hidden`，兩者都不含原始表格。

### B.2 桌面版（≥ 821px）

- 版面：既有側欄｜中間清單（工具列固定在清單頂部）｜右側詳細面板（約 340px）。
- **清單模式**（V3 預設：清單）：一列一筆。原裝陀螺列：系列色點＋型號、中文名、零件徽章、「手動」標籤（只有手動輸入才顯示）。零件列：類別、名稱、原裝／額外／配置引用／可用四欄（數字等寬字型）。
- **卡片模式**：同樣資訊的卡片格。切換按鈕在工具列右側，偏好存 `localStorage`（key 例如 `beybladeCollectionViewMode`，try/catch，讀不到時用清單）。
- **詳細面板**：
  - 原裝陀螺：型號、中文名、英文名（S1 條件成立才顯示）、零件分組（CX 依既有 `getCollectionCardParts` 順序）、資料來源說明（自動帶入／手動，D-015）、套組成員（有 `stockSetInstanceId` 時列出同套組各顆）、使用相同上蓋（或主要戰刃）的配置、「刪除收藏」。
  - 零件：類別、名稱、四個數字、超用提示、引用此零件的配置清單、（有額外持有時）「修改額外零件」「刪除額外零件」；只有原裝內含時顯示「原裝內含數量會隨原裝陀螺變動，不能在這裡修改」。
  - 收藏仍**不能修改**（現況）；面板不提供修改收藏。
- 沒有選取時顯示提示「選擇一筆資料查看詳細資訊」。

### B.3 手機版（≤ 820px）

- 頂部分頁＋搜尋框；篩選 chip 一列可橫向捲動；排序與來源以下拉選單。
- 清單固定卡片。卡片右側主數字：零件分頁顯示「可用 n」／「已全用」／「超用 n」，下方小字顯示四個數字。
- 點卡片開啟底部 sheet（內容同桌面詳細面板），sheet 內才有刪除／修改按鈕。
- 底部導覽（D-020）不變；觸控區 ≥ 44px；無水平捲動。

### B.4 搜尋、篩選、排序（只影響顯示層）

| | 原裝陀螺 | 零件 |
|---|---|---|
| 搜尋 | 型號、中文名、各零件名稱；S1：英文名只對 `stockRecordId` 能在英文對照檔找到的列比對 | 類別、名稱 |
| 篩選 | 系列（全部／UX／BX／CX）、來源（全部／自動帶入／手動輸入） | 類別（全部／上蓋／固鎖／軸心／CX 分件，沿用 `inventoryTypeMatchesFilter`）、狀態（全部／可用／已全用／超用） |
| 排序 | 預設（UX→BX→CX→型號，與 `sortTable` 相同比較）、型號、名稱 | 預設（類別順序沿用 `getInventoryTypeDisplayRank`，再依名稱）、名稱、可用數量（少→多） |

- 排序在顯示層的陣列上進行，**原始 `<tr>` 順序不受影響**。
- 搜尋框、篩選、排序狀態不寫入 Firestore；排序與篩選可不保存（重新整理後回到預設），只有 V3 檢視模式存 localStorage。
- S1「可靠對照」定義：`stockAutoFilled` 為明確 `"true"`（`isExplicitStockAutoFilled`）且 `stockRecordId` 在 `beyblade_x_model_chinese_english_*.json` 找到唯一一筆。型錄尚未載入時，英文名搜尋暫時不生效，不顯示錯誤。手動列與無 `recordId` 的舊列不以英文名比對。

### B.5 Q1 新增表單

- 位置：各分頁清單上方，可收合（`<details>` 或按鈕＋`aria-expanded`）。預設：無收藏時展開，有收藏時收合。
- 內含既有欄位與按鈕，id、`onclick`、`data-write-action` 都不變；送出仍呼叫既有 `addRow()`／`addManualStockRow`（經 `addRow`）／`addPart()`。
- 快速新增（D-020）：`#add-collection` → 切到原裝陀螺分頁、展開新增面板、聚焦 `#model`；`#add-part` → 切到零件分頁、展開、聚焦 `#partName`。`site-menu.js` 的 `QUICK_ACTION_TARGETS` 不變；分頁切換由 `script.js` 監聽 hash 處理。
- 輸入中途的行為見 §F。

### B.6 文案

- 分頁：「原裝陀螺」「零件」。
- 零件四個數字：「原裝內含」「額外持有」「配置引用」「可用」；小於 0 顯示「超用 n」。
- 摘要（U2）：「原裝內含 n」「額外持有 n」「配置引用 n」「超用品項 n」「無對應引用 n」。**不得出現「使用中」「出賽」「已使用」等字樣**；「配置引用」說明文字：「目前配置中使用這個零件名稱的次數，不是比賽使用次數」。

## C. R2 資料流與同步時序

### C.1 原則

1. 唯一儲存來源：`beybladeTable`、`partTable`、`configTable`、`historyTable` 的 `<tr>`。`collectCurrentData()`、`getTableData()`、`applyDataToTables()`、D-018 區段**完全不修改**。
2. 顯示層只讀取原始列，產生自己的 DOM（在原始表格外）。顯示層節點不在任何 `#…Table tbody` 內，因此不會被 `getTableData()` 讀到。
3. 顯示層的任何操作都轉成「以原始列的既有按鈕元素為參數呼叫既有函式」：
   - 刪除：`window.deleteRow(sourceDeleteButton)`。
   - 修改零件：`window.editRow(sourceEditButton, "part")` → 編輯完成後 `window.saveEditRow(sourceSaveButton, "part")` 或 `window.cancelEditRow(sourceCancelButton, "part")`。
   - **不使用合成 `click()`**（容器有 `inert`，對 inert 元素呼叫 `click()` 可能不會觸發，見 §K-2）。
4. 顯示層不寫 `innerText`、不改 `dataset`、不加 class 到原始列；需要的對照資料存在顯示層自己的 `WeakMap`。

### C.2 讀取與識別

- 新模組 `collection-view.js`（純函式，無 DOM、無 Firebase，可在 Node 測試）：
  - `buildStockView(rows, catalog)`、`buildPartView({stockRows, partRows, configRows})`、`filterAndSort(view, state)`、`computeDeleteImpact(...)`、`computeRenameImpact(...)`。
  - 輸入是「快照」：每列 `{ ref, cells, mainStockName, meta, editing }`，由 `script.js` 中的薄轉接函式 `readSourceRows(tableId)` 以既有 `getPersistedRowCells`、`getPersistedStockName`、`STOCK_ROW_METADATA_KEYS` 讀取，**與 `getTableData()` 同一套讀法**。
- 列識別：執行期 `WeakMap<HTMLTableRowElement, number>`，第一次讀到時配發遞增編號；不寫入 DOM 屬性。原始列被重建（遠端快照、取消編輯的 `rebuildRow` 不重建 `<tr>`，但 `applyDataToTables` 會）時，舊編號自然失效。
- （**已由第三部分 P-2 取代**：簽章不得用來找回或操作，原始列重建後一律關閉面板。）選取保存：顯示層記住 `{table, signature, occurrence}`（signature = cells＋mainStockName＋meta 的 JSON；occurrence = 第幾個相同 signature）。重建後依此找回；找不到時關閉詳細面板，狀態列顯示「這筆資料已更新或已刪除」。

### C.3 觸發

- 沿用既有 `installUiSummaryObservers`（`script.js:3630`）同樣的 `MutationObserver`（四個 tbody，`childList/subtree/characterData`），新增一個 `scheduleCollectionViewRender()`，以 `requestAnimationFrame` 合併同一畫格內多次變動。
- 另外在下列時點主動排程：型錄載入完成（英文名、來源說明）、登入狀態改變（`handleAuthStateChange` 結束後）、`updateDataAccessUi()`（寫入權限改變時更新按鈕 disabled 狀態）。
- 顯示層的按鈕 disabled 狀態由「原始列對應按鈕是否 disabled」決定，與既有寫入閘門一致；唯讀檢視（`isReadOnly()`，原始列沒有按鈕）時顯示層也不顯示操作按鈕。

### C.4 情境時序

| 情境 | 原始表格發生什麼（既有程式） | 顯示層行為 | 寫入 |
|---|---|---|---|
| 本機新增收藏／零件 | `addRow`／`addPart` 插入 `<tr>` → `saveData()` | Observer → 重新渲染；新列出現在排序後的位置 | 既有一次 |
| 本機刪除 | `deleteRow(btn)`：confirm（含 D1 影響文字）→ 移除 `<tr>`（套組一起）→ `saveData()` | 重新渲染；若刪的是選取中的列，關閉詳細面板 | 既有一次；取消 confirm 不寫 |
| 修改額外零件（**已由第三部分 P-3 取代：不使用代理輸入**） | `editRow` 讓原始列進入 `.editing-row`，儲存格換成輸入框 | 詳細面板顯示「代理編輯器」：讀取原始列輸入框的值；使用者輸入時同步設定原始輸入框的 `value`（只改 input 的值，不改儲存格文字） | 無（尚未保存） |
| 保存修改 | `saveEditRow`：confirm（含 D1 改名／減量文字）→ 寫回儲存格 → `saveData()` | 代理編輯器關閉，重新渲染 | 既有一次 |
| 取消修改 | `cancelEditRow`：confirm → `rebuildRow` 還原 | 代理編輯器關閉 | 無 |
| Escape | — | 有代理編輯器時等同「取消修改」（走既有 confirm）；否則關閉 sheet／詳細面板 | 無 |
| 遠端快照（畫面乾淨） | `applyCollectionRemoteWhenClean` → `applyDataToTables` 清空重建所有 `<tr>` | 依 C.2 找回選取；找不到則關閉面板 | 無（D-015 升級例外，見下） |
| 遠端快照（編輯中） | 同上，重建時編輯被取消並 `alert`（既有） | （P-3 取代）代理編輯器偵測原始列 `isConnected === false` → 關閉，顯示「雲端資料已更新，這次修改已取消」 | 無 |
| 遠端快照（有未儲存或儲存中） | `isCollectionSyncHolding()` → 延後（`deferredCollectionRemote`） | 不變；仍顯示目前 DOM | 依 D-018 |
| 衝突 | D-018 衝突狀態，寫入被擋，使用者在同步列選擇 | 顯示層按鈕仍呼叫既有函式，由既有閘門擋下並顯示既有訊息；不另做衝突 UI | 依 D-018 |
| 重新載入（`#retryDataLoadBtn`） | `beginDataSession` → `cancelSessionInteractions` → 重新監聽 | 原始列重建 → 重新渲染 | 無 |
| 登出 | `handleAuthStateChange(null)`：擷取 F-04 草稿 → `clearAllTables()` | 清單變空、關閉面板；**清空 Q1 輸入（見 §F）** | 無 |
| 切換帳號 | 同上，接著載入新帳號 | 同上；新帳號資料載入後重新渲染 | 無 |
| 載入時 D-015 型錄升級 | `applyRemoteCollections` 在記憶體升級並 `forceTable`，之後會儲存（既有、刻意） | 只是重新渲染；不參與 | 既有行為，不變 |
| 管理員唯讀檢視 | 原始列無操作按鈕 | 不顯示操作按鈕，可搜尋與檢視 | 無 |
| 顯示層初始化或渲染丟出例外 | — | 捕捉例外 → 移除 `#collectionSourceTables` 的視覺隱藏與 `inert`、隱藏顯示層，回到既有表格介面，並在 console 記錄 | 無 |

## D. P2 數量定義與特殊結構

### D.1 定義（以「類別＋名稱」為一種零件）

| 數字 | 計算 | 與既有程式的關係 |
|---|---|---|
| 原裝內含 | `getTotalParts()` 中來自 `beybladeTable` 的部分 | 規則逐條相同（下表）；測試要求「原裝內含＋額外持有」＝ `getTotalParts()` |
| 額外持有 | `getTotalParts()` 中來自 `partTable` 的部分（數量欄加總，只計 8 種類別） | 同上 |
| 配置引用 | `getUsedParts()`，但**排除 CX（非抽包）配置的「上蓋」欄** | 見 D.3；對所有「有持有」的零件，數值等於 `getUsedParts()` |
| 可用 | 原裝內含＋額外持有－配置引用；< 0 顯示「超用」 | 與配置選單「剩餘」相同（`refreshSelectors`） |

- 「配置引用」是**目前配置使用這個名稱的次數**，不是比賽出賽次數；文案不得混用（U2）。
- 摘要的「配置引用 n」= 所有持有零件的配置引用加總；「無對應引用 n」另計（D.4）。舊的「使用中」（Σ min(額外, 引用)）**不再顯示**，也不以新名稱呈現舊數值。

### D.2 特殊結構（依 `getTotalParts` `script.js:2813`、`addConfig` `script.js:3869` 確認）

| 結構 | 原裝陀螺如何計 | 配置如何計 |
|---|---|---|
| BX／UX 標準 | 上蓋、固鎖、軸心各 1 | 同 |
| CX 三件（紋章鎖＋主要戰刃＋輔助戰刃） | 不計「上蓋」欄（`stockAssemblySystem` 以 `CX_` 開頭或型號為 CX 且非抽包）；紋章鎖、主要戰刃、輔助戰刃、固鎖、軸心各 1 | 上蓋欄存的是組合名稱（例如「蒼龍勇氣S」，`script.js:3917`），**不是零件，排除**；其他欄同左 |
| CX 分件（金屬＋超越） | 主要戰刃欄顯示「超越/金屬」但 `mainStockName` 為空 → 不計主要戰刃；超越戰刃、金屬戰刃各 1 | 同（`mainCell.dataset.stockName = ""`，`script.js:4024`） |
| 固鎖一體（Tr、Op、惡魔冥界等，D-019） | 固鎖欄為「-」→ 不計（`addStock` 略過「-」）；軸心欄的「Tr」「Op」照常計為軸心 | 同 |
| 抽包（`RANDOM_BOOSTER_MODELS`） | CX 抽包仍計上蓋 | 抽包配置的上蓋照常計 |
| 套組（UX-21 等） | 每顆是獨立一列，各自計算；共用 `stockSetInstanceId` | — |
| 編輯中的列 | 以 `originalCells`／`originalMainStockName` 計（`getPersistedRowCells`） | 同 |

### D.3 名稱比對限制

- 以「類別＋名稱」完全相同比對（儲存格 `innerText.trim()`）；**不做全形／半形、大小寫、空白正規化**（例如「3-60」與「3－60」、「F」與「f」視為不同）。
- 同名但不同類別是不同零件。
- 零件改名不會連動配置（配置以文字引用）；這是現況，本階段不改。

### D.4 無對應引用

- 經 D.1 排除後，若配置引用的「類別＋名稱」在持有中找不到（例如零件改名、刪除後），列在零件分頁底部「找不到對應零件的配置引用」，顯示類別、名稱、引用次數與配置清單。
- 只提示，不修改配置。

### D.5 修改權限

- 只有「額外持有」可透過既有 `editRow`／`saveEditRow`／`deleteRow` 修改或刪除。
- 「原裝內含」「配置引用」「可用」是衍生數字，介面不提供輸入框；原裝內含只會因原裝收藏新增或刪除而變動。
- 同一種零件若有多筆額外列（例如曾分兩次新增），詳細面板分別列出每筆額外列，各自修改或刪除。

## E. D1 刪除影響提示

所有提示都放在**既有 confirm 文字中**（`deleteRow`、`saveEditRow` 的確認訊息前加上影響段落），不新增阻擋、不多一個步驟。取消 confirm → 既有程式直接 `return`，不修改 DOM、不呼叫 `saveData()`。

計算方式：以目前原始表格為基準，模擬變更後重算 D.1，只列出「變更後才不足」的零件；這次變更涉及、但變更前就已不足的零件，不放進清單，另加一句「軸心 R 原本就不夠配置使用（持有 1，配置引用 2），變更後會更不足。」。
- 刪除或減量後，某名稱在持有中完全消失：算「不足（持有 0）」。
- 改名後，舊名稱在持有中完全消失：改列為「找不到對應零件」，不算不足；舊名稱仍有其他持有（例如原裝內含）時，才另外判斷是否不足。最多列 5 個零件、每個零件最多 3 個配置名稱，其餘以「等 n 個」表示。

| 情境 | 觸發 | 提示內容（範本） |
|---|---|---|
| 刪除收藏（單顆） | `deleteRow`（`beybladeTable`） | 「確定要刪除「BX-01 蒼龍神劍」嗎？\n刪除後，下列零件會不夠配置使用：\n・固鎖 3-60：持有 3，配置引用 4（蒼龍爆刃 3-60 LR、惡魔紅鐮 3-60 R 等 4 個）\n配置不會被修改。」 |
| 刪除收藏（套組） | `deleteRow` 的套組分支 | 既有「「UX-21」是雙陀螺套組。確定要一起刪除「A、B」嗎？」＋「整組刪除後，下列零件會不夠配置使用：…」（以整組所有列一起模擬） |
| 刪除額外零件 | `deleteRow`（`partTable`） | 既有「確定要刪除「固鎖：3-60，數量 2」嗎？」＋同上不足清單 |
| 減少額外數量 | `saveEditRow`（`part`，數量變小） | 「確定要保存這次修改嗎？\n數量減少後，下列零件會不夠配置使用：…」 |
| 修改零件名稱或類別 | `saveEditRow`（`part`，類別或名稱改變） | 「確定要保存這次修改嗎？\n改名後，下列配置仍使用舊名稱「3-60」，將找不到對應零件：蒼龍爆刃 3-60 LR 等 n 個。\n配置不會自動改名。」＋若舊名稱因此不足，也列出不足清單 |
| 無影響 | 任一 | 只顯示既有確認文字，不加段落 |

- 「不足」與「找不到對應」分開敘述，不混用。
- 實作上需在 `deleteRow`、`saveEditRow` 內呼叫顯示層提供的純函式組出文字；**只改確認訊息字串，不改流程、不改寫入**。這兩個函式不在 D-018 區段內。

## F. F-04 與編輯狀態（更正第一部分）

| 狀態 | 是否視為「未儲存編輯」（`hasUnsavedDomInteraction`） | 遠端快照 | 登出／換帳號 |
|---|---|---|---|
| 檢視、選取、詳細面板開啟、sheet 開啟 | **否** | 正常套用；面板依 C.2 找回或關閉 | 關閉面板 |
| 搜尋、篩選、排序、切換分頁、清單／卡片切換 | **否** | 正常套用；保留搜尋與篩選條件 | 清除搜尋條件與選取 |
| 修改額外零件（原始列 `.editing-row`） | **是**（既有判斷，不需新增） | 既有：重建時取消編輯並提示 | 既有：F-04 擷取草稿，標示編輯器開啟 |
| 型號候選對話框、Quick Editor、刪除配置對話框 | 是（既有） | 既有 | 既有 |
| Q1 表單輸入到一半（未按「加入」） | **否**（與現況相同：尚未進入資料表的文字不是收藏資料） | **保留輸入**（表單在表格外，不受重建影響） | **清空 Q1 所有輸入、收合面板**（見下） |

- 現況確認：`handleAuthStateChange`（`script.js:2255`）不會清除 `#model`、`#partName` 等欄位。帳號切換後，前一個帳號輸入到一半的型號仍留在欄位中，按「加入」就會寫進新帳號。7-2a 定義為：登出或帳號改變時清空 Q1 欄位（沿用 `clearFirstAreaInputs` 並加上零件欄位），不提示、不保存。這是**與現況不同的行為**，列入 7-2a 範圍與測試。
- Q1 輸入不加入 F-04 草稿、不觸發 `beforeunload` 提示（與現況相同）。
- F-04 跨帳號隔離（`isDraftOwner`、草稿只給原帳號看）**不修改**；顯示層在登出後不得保留前一帳號的任何列資料（清單由 `clearAllTables` 觸發的重新渲染清空，選取簽章一併丟棄）。

## G. 各階段實作範圍

| 階段 | 範圍 | 不做 |
|---|---|---|
| 7-2a 分頁與原始表格隔離 | `index.html` 結構（分頁列、`#collectionSourceTables`、Q1 收合面板）、`style.css`、`script.js`：分頁切換、hash 對應、`collection-view.js` 骨架與 `readSourceRows`、Observer 排程、例外時回退、登出清空 Q1 | 搜尋篩選排序、P2 數字、詳細面板、D1 |
| 7-2b 顯示層清單與搜尋篩選排序 | 原裝陀螺與零件的顯示層清單（V3 切換、G2）、搜尋（S1）、篩選、排序、無資料與無結果狀態、鍵盤操作 | P2 四數字（零件先顯示額外持有與配置引用之外的基本資訊）、刪除與修改 |
| 7-2c P2 數量與 D1 | 四個數字、摘要（U2）、無對應引用、D1 影響文字接入 `deleteRow`／`saveEditRow` 的確認訊息 | 詳細面板 |
| 7-2d 詳細面板與操作 | 桌面詳細面板、手機 sheet、刪除與修改額外零件的轉呼叫、代理編輯器、選取找回、Escape | 修改收藏（不開放）、N2 |

每階段：一個本機 commit；push／部署另行授權；每階段更新 `guide.html`、`changelog.html` 與版本字串的時機由該階段規格決定（建議 7-2d 完成後一次發布）。

## H. 驗收測試規格

### H.0 已執行（截至本文件）

| 項目 | 結果 | 範圍 |
|---|---|---|
| 現有測試套件 | 313/313 PASS（`5c32213` 乾淨 clone，2026-11-24） | 只代表 Phase 7-1 部署前狀態；**不涵蓋任何 Phase 7-2 程式** |
| 原型瀏覽器操作（審查版） | 原型內互動正常、Console Error 0（2026-11-24） | 只驗證原型（假資料），**不代表正式程式** |
| 原型瀏覽器操作（定案版，Version 2） | 預設為最終設計；清單／卡片切換；G2 不合併；S1 手動列不能以英文名搜尋；U2 摘要無「使用中」；CX 配置組合上蓋不計入；無對應引用列出；D1 五種確認文字（單顆、套組、刪除零件、減量、改名）與「原本就不足」提醒；取消不改資料；手機 sheet 與 Escape；＋新增 聚焦 `#partName`；Console Error 0 | 同上，只驗證原型的計算與互動；原型的計算是正式規則的**示意實作**，不能取代 C-01～C-08 |

| K-1 隔離驗證（第三部分 P-1） | 28 組全部執行，無錯誤；clip 隱藏與可見完全相同；`display:none`／`hidden`／`row.hidden` 改變連續空白；`visibility:hidden` 清空資料；K-7 黃金值 | 以真實 `script.js` 原始碼在 Chromium 156 執行，**不是正式程式的新功能測試**；Phase 7-2 程式尚未撰寫 |

以下 H.1–H.6 全部是**未來預計測試，尚未執行**。

### H.1 7-2a

| ID | 測試 | 方法 | 狀態 |
|---|---|---|---|
| A-01 | 切換分頁（多次、含 hash `#inventorySection`、`#add-part`）前後 `collectCurrentData()` 去除 `updatedAt` 後深度相等 | VM／jsdom 或瀏覽器腳本，以多種資料（BX、UX、CX 三件、CX 分件、套組、手動列、未知欄位）載入 | 計畫 |
| A-02 | 分頁切換、Observer 渲染後，原始 `<tr>` 的順序與元素身分不變 | 記錄 `tbody.rows` 參照陣列比對 | 計畫 |
| A-03 | 原始儲存格 `innerText`、`data-stock-name`、`dataset` 在任何顯示層操作後不變 | 逐格比對；含分件 CX `mainStockName = ""` | 計畫 |
| A-04 | 原始表格容器為「已渲染但視覺隱藏」，不是 `display:none`；值含連續空白時 `getTableData` 與隱藏前相同 | 瀏覽器測試（§K-1） | 計畫（設計階段已以隔離驗證確認方法可行，見 P-1；正式程式仍需重跑） |
| A-05 | 分頁切換、Observer 不呼叫 `saveData`、不觸發 `collectionSync` 任何寫入 | 以 stub 計數 | 計畫 |
| A-06 | D-020：`#add-collection` 切到原裝陀螺並聚焦 `#model`；`#add-part` 切到零件並聚焦 `#partName`；`site-navigation.test.mjs` 全過 | Node＋瀏覽器 | 計畫 |
| A-07 | 登出、換帳號後 Q1 欄位清空；遠端快照時 Q1 輸入保留 | VM 驅動 `handleAuthStateChange`、`applyCollectionRemoteWhenClean` | 計畫 |
| A-08 | 顯示層初始化丟出例外時回到既有表格介面，資料不變 | 注入錯誤 | 計畫 |
| A-09 | D-018 區段雜湊、`collection-sync.js`、`getTableData`／`collectCurrentData`／`applyDataToTables` 原始碼不變 | 雜湊比對 | 計畫 |

### H.2 7-2b

| ID | 測試 | 狀態 |
|---|---|---|
| B-01 | 每種搜尋、篩選、排序組合後：`collectCurrentData()` 不變、原始列順序不變、`saveData` 未被呼叫 | 計畫 |
| B-02 | 顯示層筆數與內容＝原始列（G2：同款兩顆顯示兩筆；套組各顆分開） | 計畫 |
| B-03 | 排序結果與 `sortTable` 比較規則一致（預設排序） | 計畫 |
| B-04 | S1：英文名只比對可靠對照列；手動列、無 `recordId` 列、型錄未載入時不以英文名命中 | 計畫 |
| B-05 | V3 偏好寫入 localStorage 失敗（拋例外）時仍正常顯示清單 | 計畫 |
| B-06 | 本機新增、刪除、遠端快照後顯示層在下一個畫格內與原始列一致 | 計畫 |
| B-07 | 鍵盤：分頁列方向鍵切換、Tab 順序依「工具列→清單→詳細面板」、清單項可用 Enter 選取 | 計畫 |

### H.3 7-2c

| ID | 測試 | 狀態 |
|---|---|---|
| C-01 | 對所有測試資料：原裝內含＋額外持有＝ `getTotalParts()`（以真實 `script.js` 函式在 VM 比對） | 計畫 |
| C-02 | 配置引用：對所有持有零件等於 `getUsedParts()`；CX（非抽包）配置的上蓋組合名稱不計入；抽包上蓋計入 | 計畫 |
| C-03 | 特殊結構：CX 分件、固鎖一體（Tr、Op、惡魔冥界「-」）、套組、編輯中的列 | 計畫 |
| C-04 | 名稱比對不正規化（「3-60」與「3－60」分開）；同名不同類別分開 | 計畫 |
| C-05 | 無對應引用清單正確（改名、刪除後出現） | 計畫 |
| C-06 | 摘要文字沒有「使用中」；「配置引用」數字不等於舊 `inventoryUsed` 公式時仍以新定義顯示 | 計畫 |
| C-07 | D1：刪除單顆、刪除套組、刪除額外零件、減量、改名五種情境的確認文字符合 §E；「不足」與「找不到對應」分開 | 計畫 |
| C-08 | D1：confirm 取消 → DOM 不變、`saveData` 未呼叫；confirm 確認 → 與現況相同的一次寫入 | 計畫 |

### H.4 7-2d

| ID | 測試 | 狀態 |
|---|---|---|
| D-01 | 從詳細面板刪除：同款兩顆中選第二顆，實際刪除的是第二個原始列 | 計畫 |
| D-02 | 套組任一顆刪除 → 走既有套組確認，整組一起刪除，不影響其他套組 | 計畫 |
| D-03 | （**由第三部分 K5-01～07 取代**）代理編輯器：輸入只改原始列 input 的 `value`；保存走 `saveEditRow`、取消走 `cancelEditRow`；保存後原始儲存格與直接在表格修改的結果相同 | 計畫 |
| D-04 | 純檢視、搜尋、篩選、排序、開啟詳細面板時 `hasUnsavedDomInteraction()` 為 false；進入修改時為 true | 計畫 |
| D-05 | 編輯中收到遠端快照 → 代理編輯器關閉並提示；原始資料依 D-018 處理 | 計畫 |
| D-06 | （**由第三部分 K4-02、K4-03 取代**：重建後一律關閉面板，不依簽章找回） | 計畫 |
| D-07 | 寫入閘門：未登入、載入中、唯讀檢視時顯示層按鈕 disabled 或不顯示，與原始列一致 | 計畫 |
| D-08 | Escape：關閉 sheet／面板；代理編輯器中為取消修改（既有 confirm）；焦點回到觸發元素 | 計畫 |
| D-09 | 修改收藏仍不可用；沒有「用此陀螺建立配置」（N2） | 計畫 |

### H.5 共通回歸（每階段）

| ID | 內容 | 狀態 |
|---|---|---|
| X-01 | 既有 13 個測試檔全過（含 D-015 `collection-autofill-safety`、D-018 `collection-sync`、F-04 `data-session-safety`、D-019 `assembly-rules`、D-020 `site-navigation`） | 計畫 |
| X-02 | `manager-ui-refresh.test.mjs` 第 264–269 行目前鎖定舊「使用中」計算；7-2c 需修改這些斷言以符合 U2，**修改時在交接紀錄列出原斷言與新斷言** | 計畫 |
| X-03 | validate、build、`git diff --check` | 計畫 |
| X-04 | 本機預覽：主頁 390／768／1440 × 深色／米色，無水平捲動、Console Error 0；未登入狀態 | 計畫 |
| X-05 | 鍵盤與螢幕閱讀器：原始表格容器不可聚焦、不被朗讀；分頁 `role=tablist`；sheet 開啟時焦點在 sheet 內 | 計畫 |

### H.6 Emulator 驗收計畫（登入與多裝置）

使用 Phase 6A 的 Firestore／Auth Emulator 環境（連接埠 8185／9199，避開使用者其他專案佔用的 8085），只用測試帳號與假資料，不連正式 Firestore。

| ID | 步驟 | 預期 |
|---|---|---|
| E-01 | 帳號 A 新增收藏、零件；切分頁、搜尋、排序 | 只有新增產生寫入；其他操作 0 寫入（以 Emulator 請求紀錄計數） |
| E-02 | 分頁 1、2 同帳號；分頁 1 修改零件中，分頁 2 刪除另一零件 | 分頁 1 收到快照時編輯取消並提示；資料不遺失；D-018 行為與現況相同 |
| E-03 | 兩分頁同時刪除同款兩顆中的不同顆 | 各刪各的，或依 D-018 顯示衝突；不刪錯列 |
| E-04 | 分頁 1 Q1 輸入一半 → 分頁 2 新增資料 | 分頁 1 輸入保留 |
| E-05 | Q1 輸入一半 → 登出 → 以帳號 B 登入 | 欄位已清空；帳號 B 沒有收到 A 的輸入；F-04 草稿只給 A |
| E-06 | 有未儲存變更時換帳號 | F-04 行為與現況相同 |
| E-07 | 有 `stockAutoFilled:"true"` 的舊列載入（D-015 升級） | 升級與一次儲存行為與現況相同；手動列不被覆蓋 |
| E-08 | 舊版主頁分頁（v1.10.0）與新版同時開啟 | 舊版仍可正常讀寫（資料格式未變） |
| E-09 | 管理員唯讀檢視 | 不出現操作按鈕；0 寫入 |

## I. 回退方案

1. **單階段回退**：每階段一個 commit；問題發生時以 `git revert <commit>` 建立反向 commit，經授權後 push，等待 Pages 建置並比對正式檔案（不使用 `reset --hard`、不 force push）。
2. **資料面**：本階段不改資料格式與儲存流程，回退不需資料遷移；舊版程式可直接讀寫新版期間儲存的資料。
3. **執行期回退**：顯示層初始化或渲染發生例外時，自動解除原始表格的視覺隱藏與 `inert`，回到既有表格介面（§C.4 最後一列），使用者仍可新增與刪除。
4. **部署前**：依既有程序備份、關閉舊分頁；部署後先以未登入狀態驗收，再由使用者登入驗證。

## J. 預計修改檔案（定案版）

| 檔案 | 階段 | 內容 |
|---|---|---|
| `index.html` | a、b、d | 分頁列、`#collectionSourceTables`（兩張原始表格移入，標記不變）、Q1 收合、顯示層容器、詳細面板容器、版本字串 |
| `style.css` | a–d | 顯示層、分頁、sheet、視覺隱藏容器；不對原始資料儲存格加 `text-transform` 或隱藏子元素 |
| `collection-view.js`（新） | a–d | 純函式：快照轉換、篩選排序、P2 數量、D1 影響、選取簽章 |
| `script.js` | a–d | `readSourceRows`、顯示層渲染與排程、分頁與 hash、登出清空 Q1、`deleteRow`／`saveEditRow` 確認文字接入 D1、`updateUiSummaries` 改為 U2 摘要 |
| `tests/collection-view.test.mjs`（新）等 | a–d | H.1–H.5 |
| `guide.html`、`changelog.html`、`docs/*` | d | 說明與決策（新增 D-021） |

**不修改**：`collection-sync.js`、D-018 區段、`getTableData`、`collectCurrentData`、`applyDataToTables`、`upgradeStoredStockItem` 等 D-015 函式、`assembly-rules.js`、`site-menu.js` 的 D-020 選單內容、`tournament*`、Firebase 設定與 Rules、型錄 JSON、競賽統計。

## K. 仍未驗證的技術風險（狀態與驗收階段以第三部分 P-6 為準）

| # | 風險 | 說明 | 預定驗證 |
|---|---|---|---|
| K-1 | `innerText` 與隱藏方式 | 元素 `display:none` 時 `innerText` 回傳 `textContent`，不套用空白摺疊；渲染中的元素會摺疊連續空白。若資料值含連續空白，隱藏方式不同會讓 `getTableData` 結果不同 → 指紋改變 → 寫入。現行零件篩選已用 `row.hidden`，代表此差異可能已存在於正式環境。R2 採「已渲染的視覺隱藏」以維持與可見時相同。 | A-04；另以 Emulator 檢查實際資料是否含連續空白（只讀） |
| K-2 | `inert` 與合成點擊 | 對 inert 元素呼叫 `click()` 是否觸發，各瀏覽器行為尚未實測；規格因此一律直接以按鈕元素呼叫函式，不依賴點擊。需確認既有函式不依賴 event 物件。 | D-01、D-03 |
| K-3 | Observer 頻率 | 大量收藏時，每次儲存格變動都重新渲染可能變慢；以 `requestAnimationFrame` 合併。未量測實際收藏規模。 | B-06＋效能量測（例如 500 列假資料） |
| K-4 | 選取找回 | 原始列沒有唯一 ID；以簽章＋第幾個相同簽章找回，同款多顆在遠端刪除其中一顆時可能對應到另一顆。採保守做法：無法確定時關閉面板。 | D-06 |
| K-5 | 代理編輯器 | 修改額外零件時的輸入框實際在隱藏的原始列內；代理同步若遺漏（例如類別 `<select>`）會保存到未預期的值。 | D-03 |
| K-6 | confirm 文字長度 | D1 文字放在原生 confirm，手機上過長會被截斷。限制 5 個零件、3 個配置名稱。 | C-07＋手機實機 |
| K-7 | 舊測試鎖定舊摘要 | `manager-ui-refresh.test.mjs` 鎖定 `inventoryUsed` 舊公式；U2 實作必須修改測試，需在審查時確認。 | X-02 |
| K-8 | 名稱不正規化 | 使用者輸入的全形／大小寫差異會讓同一零件分成兩列，P2 會更明顯地呈現這個既有問題。本階段只呈現，不修正。 | C-04 |
| K-9 | 登入後流程 | 本階段與原型都沒有登入操作；所有寫入相關情境只能在 Emulator 或使用者實際登入後確認。 | H.6 |


---

# 第三部分：實作前技術補強（2026-11-24）

> 狀態不變：**設計已定案，實作尚未授權**。10 項決策不變。本部分補強 K-1、K-4、K-5、Q1、K-7，並記錄一次**隔離驗證**（只讀，未修改正式網站檔案）。標示「已執行」的只有 P-1 的隔離驗證；其餘測試仍是計畫。
> 本部分與第二部分衝突時，以本部分為準；第二部分被取代的段落已加註。

## P-1. K-1：原始表格隱藏方式（已執行隔離驗證）

### 方法

- 驗證程式：[`verification/k1-hidden-table/`](verification/k1-hidden-table/)（`frame.html`、`harness.html`、`serve-k1.mjs`、`README.md`）。
- **真實程式路徑**（`main` = `50169d7`）：以函式標記從 `script.js` 切出原始碼本身，在真實瀏覽器排版引擎（Chromium 156）執行：
  - 建列：`createBeybladeRow`、`createPartRow`、`createConfigRow`、`createHistoryRow`、`getStoredItemExtras`、`applyBeybladeRowMetadata`、`clearAllTables`
  - 讀取：`getStockNameFromCell`、`getPersistedRowCells`、`getPersistedStockName`、`getTableData`、`getHistoryData`、`collectCurrentData`
  - 排序：`sortTable`、`sortBeybladeTable`、`getSeriesFromModel`
  - 正式頁面上會跑的畫面處理：`updateResponsiveTableCells`、`applyInventoryFilters`、`getCollectionCardParts`
  - K-7 摘要：`getTotalParts`、`getUsedParts`、`updateUiSummaries`、`addStock`、`isRandomBooster`、`normalizeModel`
  - 指紋：`collection-sync.js` 的 `fingerprintTable`、`pickCollectionTables`（直接 import）。
- 頁面：真實 `index.html` 結構（移除 script）＋真實 `style.css`、`site-menu.css`。替身只有 `isReadOnly`、`dataSessionGuard.captureWriteSession`、`currentUser`、空的型錄對照表。
- 資料：
  - 同款三顆（其中一顆帶未知欄位）、BX-00 套組兩顆（同一個 `stockSetInstanceId`）
  - CX 三件（`mainStockName` 含連續空白）、CX 分件（`mainStockName = ""`）、固鎖一體（CX-11 Op，`stockAutoFilled:false`）
  - 連續空白、全形空白、NBSP、TAB、換行、前後空白
  - 零件同名兩列、CX 配置（組合上蓋）、歷史測試（連續空白）
- 矩陣：390／1440 寬 × 深色／米色 × 7 種狀態，共 28 組；以「可見、1440、深色」為基準，逐筆比對 `cells`、`mainStockName`、metadata、未知欄位、列順序與四表 `fingerprintTable`。

### 結果

| 狀態 | 4 組結果 | 結論 |
|---|---|---|
| 可見 | 完全相同 | 基準穩定（寬度、主題不影響） |
| **視覺隱藏容器**（`position:absolute; 1px; overflow:hidden; clip-path: inset(50%)`＋`aria-hidden`＋`inert`，同時把兩個分頁區段設為 `hidden`） | **完全相同**（cells、mainStockName、metadata、順序、指紋） | **採用** |
| 現行零件篩選（`applyInventoryFilters`，本組隱藏的列不含連續空白） | 相同 | 不能證明安全，見下一列 |
| 每列 `row.hidden` | 不同：零件「雙␣␣空白」可見時存「雙␣空白」，隱藏時存「雙␣␣空白」 | 禁止用於原始列 |
| 表格 `display:none`／區段 `hidden`（表格在區段內） | 不同（同上） | 禁止 |
| `visibility:hidden` | **所有零件儲存格與收藏型號變成空字串** | **絕對禁止**（會清空資料） |

所有狀態都保持不變的項目：同款三顆的順序與各自的未知欄位、套組的 `stockSetInstanceId`、CX 分件 `mainStockName = ""`、CX 三件 `mainStockName` 的連續空白、`stockAutoFilled:false`。

### 驗證中發現的既有行為（現行正式網站就是如此，與 R2 無關，本階段不修正）

1. 收藏儲存格內的換行被移除、前後空白被去除；`mainStockName` 保留原值。
2. 零件名稱、歷史測試的組合與備註，**可見時**連續空白被摺疊成一個空白。
3. **現行零件篩選的潛在多餘寫入**：零件名稱含連續空白時，篩選把該列隱藏後，`collectCurrentData()` 會讀到未摺疊的值，與可見時不同 → 指紋改變 → 下次儲存時 `partTable` 被視為有變更而寫入（內容只有空白差異）。只影響名稱含連續空白的零件。R2 改由顯示層篩選、不再對原始列設 `hidden` 後，這個情況會自然消失；在那之前維持現狀，另列為已知問題（見 P-6 R-K1b）。

### 規格修正（取代第二部分 B.1 的隱藏描述）

- 原始表格**只能**以「已渲染的視覺隱藏」處理。`beybladeTable`、`partTable` 各自放在獨立的隱藏容器（`.source-table-box`），容器樣式固定為上表的 clip 寫法，`aria-hidden="true"`、`inert`。
- 禁止對原始表格、其祖先或原始列使用 `display:none`、`hidden` 屬性、`visibility:hidden`、`content-visibility`、`text-transform`。
- 7-2b 起，零件篩選改由顯示層處理，`applyInventoryFilters` 不再對原始列設定 `row.hidden`（只做顯示層需要的計算，或停止呼叫）；需新增測試證明篩選前後指紋不變（含連續空白名稱）。
- 這些都不涉及 D-018：`getTableData`、`collectCurrentData`、`collection-sync.js` 不修改。

## P-2. K-4：選取身分與刪除安全

### 原則

- 「內容簽章＋重複序號」**不是**穩定 ID，只能用來顯示，不能用來決定操作哪一列。
- 唯一可用來操作的身分是**當下仍連在 DOM 上的原始 `<tr>` 元素本身**（顯示層以 `WeakMap<tr, viewId>` 對應）。
- 原始列一旦被重建（`isConnected === false`），選取就失效，不嘗試以簽章找回。（取代第二部分 C.2「選取保存」與 D-06 的「依簽章找回」。）

### 狀態流程

```
[未選取] --點選清單項--> [已選取: ref=tr, shown=snapshot(tr)]
[已選取] --Observer 觸發--> 檢查 ref.isConnected
     ├─ false（遠端重建、刪除、登出、換帳號）→ 關閉詳細面板／sheet，狀態列「資料已更新，請重新選擇」→ [未選取]
     └─ true → 重新讀取 snapshot(tr)，面板顯示最新內容 → [已選取]
[已選取] --按「刪除」--> 刪除前檢查（全部通過才繼續）：
     1. ref.isConnected 且仍在預期 tbody（#beybladeTable 或 #partTable）
     2. snapshot(ref) 與面板正在顯示的 shown 完全相同（cells、mainStockName、metadata）
     3. 套組：以當下 DOM 重新找出同 stockSetInstanceId 的所有列，數量與各列 snapshot 必須等於面板顯示的套組清單
     4. 原始列的刪除按鈕存在且未 disabled（寫入閘門）
   ├─ 任一不符 → 不呼叫 deleteRow，重新渲染，提示「資料已變更，請重新確認」→ [已選取或未選取]
   └─ 全部通過 → window.deleteRow(原始刪除按鈕)
        → 既有 confirm（含 D1 文字與既有套組名單）→ 取消：不改 DOM、不寫入
                                                     → 確定：既有流程移除 <tr>（套組整組）→ saveData()
```

- `confirm` 是同步的，執行期間 Firestore 快照回呼不會插入；`deleteRow` 本身在單列分支確認後還會再檢查 `row.isConnected` 與寫入 session（既有程式）。套組分支沒有這個再檢查，但同樣受 confirm 同步保護。
- D1 影響文字在呼叫 `deleteRow` 前、以同一個 DOM 狀態計算。

### 測試情境（計畫）

| ID | 情境 | 預期 |
|---|---|---|
| K4-01 | 同款三顆，選第二顆刪除 | 被移除的是第二個原始 `<tr>`（以元素參照比對）；其餘兩顆的未知欄位不變 |
| K4-02 | 選取第二顆後，遠端快照重建（內容相同） | 面板關閉；不自動改選任何一顆 |
| K4-03 | 選取第二顆後，另一裝置刪除了第一顆（遠端重建） | 面板關閉；不會變成指向原本的第三顆 |
| K4-04 | 面板開啟後，原始列內容被本機其他操作改變（例如在另一處修改） | 刪除前檢查 2 不符 → 不刪除、提示 |
| K4-05 | 套組其中一顆被遠端刪除後，從另一顆按刪除 | 檢查 3 不符 → 不刪除、提示 |
| K4-06 | 刪除套組任一顆 | 既有確認列出整組名稱；確定後整組移除，其他套組與同款非套組列不變 |
| K4-07 | 刪除 confirm 選取消 | DOM 與 `collectCurrentData()` 不變；`saveData` 未呼叫 |
| K4-08 | 唯讀檢視、未登入、載入中 | 顯示層刪除按鈕 disabled 或不顯示；強制呼叫時 `deleteRow` 的既有 `requireLogin` 擋下 |
| K4-E1（Emulator） | 兩分頁同帳號：分頁 1 選同款第二顆並開啟刪除確認前，分頁 2 刪除同款第一顆並儲存 | 分頁 1 收到快照 → 重建 → 面板關閉；分頁 1 不會刪除任何列；雲端剩下正確的兩顆 |
| K4-E2（Emulator） | 兩分頁同時各刪同款不同顆 | 依 D-018：後儲存者得到衝突或正確合併；不會刪錯列、不會多刪 |

## P-3. K-5：修改額外零件（改為不使用代理輸入）

### 決定（取代第二部分 C.4「代理編輯器」各列、§G 7-2d 與 D-03）

不建立代理輸入。**直接讓使用者在原始列上編輯**：

- 按詳細面板的「修改」時，顯示層解除 `partTable` 所在隱藏容器的 clip 與 `inert`，把它以「修改額外零件」對話框呈現（容器只改容器本身的樣式，不移動、不隱藏任何 `<tr>`），然後呼叫 `window.editRow(原始修改按鈕, "part")`，捲動到該列並聚焦第一個輸入框。
- 使用者使用的是原始列內既有的輸入框與既有的「保存」「取消」按鈕，所以**輸入值只存在原始列（單一資料來源）**，保存與取消完全走既有 `saveEditRow`／`cancelEditRow`（含既有 confirm 與 D1 文字）。
- 對話框中其他列以 CSS 變淡並設 `pointer-events:none`（只改樣式，不改原始列）。鍵盤仍可 Tab 到其他列的按鈕，這是既有行為（現行網站也可同時編輯多列），不另外限制。
- 由 K-1 驗證：容器在「clip 隱藏」與「可見」兩種狀態下 `getTableData()` 結果完全相同，所以開關對話框不影響資料。

### 狀態流程

```
[檢視] --修改--> 前置檢查（同 P-2 檢查 1、2、4）→ 開啟對話框 → editRow(btn,"part") → [編輯中]
      （原始列 .editing-row → hasUnsavedDomInteraction() = true；既有 F-04／遠端保護自動生效）
[編輯中] --保存--> saveEditRow 既有 confirm（含 D1）
      ├─ 取消 confirm → 仍在 [編輯中]
      ├─ 驗證失敗（名稱空白、數量 ≤ 0，既有 alert）→ 仍在 [編輯中]
      ├─ 寫入閘門擋下（未登入、衝突中、載入中，既有訊息）→ 仍在 [編輯中]
      └─ 成功 → 儲存格寫回、列離開編輯 → saveData()（D-018）→ Observer 偵測無 .editing-row → 關閉對話框、恢復隱藏 → [檢視]
           └─ 之後 saveData 失敗或衝突：由既有同步列處理（資料已在 DOM，與現行相同）
[編輯中] --取消 或 Esc--> cancelEditRow 既有 confirm
      ├─ 取消 confirm → 仍在 [編輯中]
      └─ 確定 → rebuildRow 還原 → 關閉對話框 → [檢視]（不寫入）
[編輯中] --遠端快照重建--> 既有：編輯取消並 alert → 原始列不存在 → Observer 關閉對話框、恢復隱藏 → [未選取]
[編輯中] --登出／換帳號--> 既有：F-04 擷取草稿（標示編輯器開啟）→ clearAllTables → Observer 關閉對話框、恢復隱藏 → [未選取]
```

- 關閉對話框的唯一依據是「`partTable` 內已沒有 `.editing-row`」；顯示層自己不保存任何編輯值。
- 不新增任何寫入函式；`saveEditRow`、`cancelEditRow`、`editRow` 的流程不改，只在 `saveEditRow` 的確認文字加入 D1 段落（第二部分 §E）。

### 測試（計畫）

| ID | 內容 |
|---|---|
| K5-01 | 修改流程後原始列儲存格與「直接在表格修改」完全相同；`saveData` 呼叫一次 |
| K5-02 | 取消 confirm（保存或取消時）→ 仍在編輯；Esc → 走 `cancelEditRow` |
| K5-03 | 驗證失敗、寫入閘門擋下 → 對話框保持開啟，資料不變 |
| K5-04 | 編輯中遠端重建 → 對話框關閉、隱藏恢復（容器回到 clip＋inert） |
| K5-05 | 編輯中登出／換帳號 → F-04 草稿 `editorOpen: true`，對話框關閉，新帳號看不到前一帳號的編輯值 |
| K5-06 | 對話框開關前後 `collectCurrentData()`（去除 `updatedAt`）相同 |
| K5-07 | 顯示層原始碼中沒有寫入儲存格、`dataset`、`setDoc`／`runTransaction`／`saveData` 以外的寫入呼叫（靜態檢查） |

## P-4. Q1：新增表單跨帳號安全

### 清除範圍

| 清除（登出、或登入帳號 UID 改變時） | 不清除 |
|---|---|
| 新增收藏：`#model`、`#layer`、`#lock`、`#primaryBlade`、`#transcendBlade`、`#metalBlade`、`#aux`、`#fix`、`#axis`（即既有 `clearFirstAreaInputs` 清單），並呼叫既有 `renderStockAutoPreview()` 讓預覽回到空白 | F-04 草稿（`orphanedCollectionDrafts`）與其提示、下載、捨棄 |
| 新增零件：`#partName`、`#partCount` 清空，`#partType` 回到第一個選項（上蓋） | 原始表格的列（由既有 `captureOrphanedCollectionDraft` 先擷取，再由既有 `clearAllTables` 處理） |
| 顯示層的搜尋文字、篩選、排序、選取、詳細面板 | Quick Editor、型號候選、刪除配置對話框（既有 `cancelSessionInteractions` 已處理，不改） |
| Q1 面板展開狀態（收合） | 主題、側欄、V3 清單／卡片偏好（localStorage 的 UI 偏好） |
| | 收藏輸入模式（自動帶入／手動）：保留目前模式，只清欄位值 |

### 時機與條件

- 呼叫位置：`handleAuthStateChange` 內，在既有 `captureOrphanedCollectionDraft(user)` 之後、`clearAllTables()` 之前（緊接 `cancelSessionInteractions()`）。這是 F-04 區段內的**一行新增呼叫**，不改變草稿擷取的順序與內容。
- 條件：`user === null`（登出），或 `previous && user && previous.uid !== user.uid`（換帳號），或 `!previous && user`（從未登入狀態登入，避免未登入時打的字被帶入）。同一帳號重新觸發（`session-reset`）時**不清除**。
- 遠端快照、重新載入（`#retryDataLoadBtn`）、衝突處理：**不清除**（表單在表格外，不受重建影響）。
- Q1 輸入不算未儲存資料：不加入 F-04 草稿、不觸發 `beforeunload`（與現況相同）。清除時不提示。

### 測試（計畫）

| ID | 情境 | 預期 |
|---|---|---|
| Q1-01 | 帳號 A 在 `#model` 輸入「UX-01」、`#partName` 輸入「3-60」、`#partCount` 輸入「2」（不送出）→ 換成帳號 B | B 登入後三個欄位都是空的，`#partType` 為「上蓋」；預覽為空白 |
| Q1-02 | 接續 Q1-01，B 直接按「加入」 | 走既有空值檢查（「請輸入零件名稱」等），沒有任何 A 的內容被寫入 B |
| Q1-03 | A 在手動模式填了上蓋、固鎖、軸心 → 登出 | 全部清空；輸入模式仍為手動 |
| Q1-04 | A 輸入一半 → 同帳號 `session-reset` | 欄位保留 |
| Q1-05 | A 輸入一半 → 收到遠端快照重建 | 欄位保留 |
| Q1-06 | A 有未儲存的收藏列＋Q1 輸入一半 → 換成 B | F-04 草稿照常擷取 A 的列（內容與現況相同、只給 A 看）；Q1 欄位清空；草稿內不含 Q1 文字 |
| Q1-07 | 清除過程 | 不呼叫 `saveData`、不改任何原始列、不關閉 F-04 草稿提示 |
| Q1-08 | 回歸 | `data-session-safety.test.mjs`（F-04）全部通過，且原有斷言不修改 |
| Q1-E1（Emulator） | 真實登入 A → 輸入一半 → 登出 → 登入 B → 檢查 B 的 Firestore 文件 | B 沒有新增任何資料；A 的資料不變 |

## P-5. K-7：摘要測試（保留舊公式驗證）

### 現有斷言（`tests/manager-ui-refresh.test.mjs`）

| 行 | 斷言 | 7-2a／7-2b | 7-2c（U2 上線） |
|---|---|---|---|
| 264 | `id="inventoryTotal"` 存在 | 保留 | 保留（額外持有總數，意義不變） |
| 265 | `id="inventoryUsed"` 存在 | 保留 | 以 P-5 新測試取代：元素可保留但不得以「使用中」或「配置引用」標籤顯示舊數值 |
| 266 | `id="inventoryAvailable"` 存在 | 保留 | 同上 |
| 268 | 原始碼含 `inventoryUsed += Math.min(count, usedParts[type]?.[name] \|\| 0)` | 保留 | 以「行為測試＋黃金值」取代（見下），驗證強度不低於原斷言 |
| 269 | 原始碼含 `setUiSummaryValue("inventoryAvailable", Math.max(0, inventoryTotal - inventoryUsed))` | 保留 | 同上 |

- 7-2a、7-2b 不得修改這些斷言，必須照原樣通過。
- 7-2c 修改時，交接紀錄必須列出原斷言全文、新測試名稱與對應關係，並由使用者在該階段核准；不得只刪除或放寬。

### 舊公式的黃金值（已執行，由真實程式產生）

以 P-1 的驗證資料執行**現行** `updateUiSummaries()`（真實原始碼，Chromium 156）得到：

| 欄位 | 值 | 定義（現行） |
|---|---|---|
| `inventoryKinds` | 4 | 額外零件「類別＋名稱」種類數 |
| `inventoryTotal` | 8 | 額外零件數量加總 |
| `inventoryUsed`（舊「使用中」） | 2 | Σ min(額外數量, 配置引用)：固鎖 3-60 min(2,1)=1、軸心 F min(4,1)=1 |
| `inventoryAvailable` | 6 | max(0, 8 − 2) |

同一份資料以 U2 新定義計算「配置引用」（對所有持有零件加總，排除 CX 配置的組合上蓋）＝ **9**；真實 `getUsedParts()` 另外回傳 `上蓋|紋章鎖金屬超越S: 1`（CX 組合上蓋），`getTotalParts()` 沒有這個鍵，證實第二部分 D.2 的排除規則必要。

### 7-2c 新測試（計畫）

| ID | 內容 |
|---|---|
| K7-01 | **舊公式保留驗證**：測試檔內以獨立 oracle `legacyInventoryUsed(partRows, usedParts) = Σ min(extra, used)` 重算，並斷言對 P-1 資料等於黃金值 2／6；這證明「舊數值是什麼」仍被驗證 |
| K7-02 | **不得冒充**：對同一資料，畫面上標示「配置引用」的數字等於 9，且不等於舊值 2；頁面上不存在文字「使用中」 |
| K7-03 | **配置引用正確性**：對每個持有零件，新數字 = 真實 `getUsedParts()[type][name]`；CX（非抽包）配置的上蓋組合名稱不計；抽包配置的上蓋計入 |
| K7-04 | **原裝＋額外 = 總持有**：對每個零件，原裝內含＋額外持有 = 真實 `getTotalParts()[type][name]` |
| K7-05 | 無對應引用：P-1 資料中排除 CX 組合上蓋後為 0；在資料中加入「引用不存在名稱」的配置後為 1 |
| K7-06 | `inventoryTotal`（額外持有總數）與舊值相同（8） |

## P-6. 剩餘風險與驗收階段（取代第二部分 §K 的狀態欄）

| # | 風險 | 狀態 | 驗收階段 |
|---|---|---|---|
| K-1 | 隱藏方式影響 `innerText` | **已隔離驗證**：clip 隱藏與可見完全相同；`display:none`／`hidden`／`row.hidden` 會改變連續空白；`visibility:hidden` 會清空。規格已限定只用 clip | 7-2a（A-04 在正式程式重跑同一矩陣） |
| R-K1b | 現行零件篩選對含連續空白的名稱造成多餘寫入（既有） | 已確認存在，未修正 | 7-2b 改由顯示層篩選後消失；B-01 加入連續空白資料 |
| K-2 | `inert` 與 `click()` | Chromium 156：仍會觸發、不可聚焦。Safari／iOS 未測。規格不依賴點擊 | 7-2d（實機 Safari 補測） |
| K-3 | Observer 頻率與效能 | 未量測 | 7-2b（500 列假資料量測） |
| K-4 | 選取身分 | 規格改為「只認仍連線的原始 `<tr>`」＋刪除前四項檢查 | 7-2d（K4-01～08）＋Emulator K4-E1／E2 |
| K-5 | 編輯值同步 | 規格改為不使用代理輸入，直接在原始列編輯 | 7-2d（K5-01～07） |
| K-6 | confirm 文字長度 | 未驗證 | 7-2c（手機實機） |
| K-7 | 舊摘要斷言 | 已取得黃金值；替換規則已定 | 7-2c（K7-01～06，需使用者核准斷言替換） |
| K-8 | 名稱不正規化；可見時零件名稱的連續空白會被摺疊，與收藏表（未摺疊）比對時可能對不上 | 已在 P-1 觀察到兩表行為不同 | 7-2c（C-04 加入此案例，只呈現不修正） |
| K-9 | 登入後流程 | 未驗證 | 各階段 Emulator（E-01～E-09、K4-E1／E2、Q1-E1） |
| Q1 | 跨帳號殘留輸入 | 已確認現況不清除；規格已定清除範圍 | 7-2a（Q1-01～08） |
