# 競賽統計資訊密度調整報告

完成日期：2026-08-29

## 本次範圍

本次只調整競賽統計頁的排版、間距、字級、列高、觸控區與響應式安全區。沒有修改資料庫、統計數值、名稱對照、搜尋身分、路由、排名、完整配置內容或其他網站功能。

## 修改檔案

- `competition-stats.css`：整理共用尺寸變數、桌面／手機間距、排行榜及詳細列表密度、摘要卡與安全區。
- `competition-stats.html`：縮短常駐搜尋提示，將鍵盤操作說明保留於螢幕閱讀器文字與 placeholder；更新靜態資源版本。
- `competition-stats.js`：沒有搜尋內容時停用清除按鈕，按鈕寬度仍保留，避免輸入框跳動。
- `tests/competition-statistics.test.mjs`：新增密度樣式、44px 觸控區與安全區回歸測試。
- `scripts/verify-statistics-browser.mjs`：新增六種尺寸、摘要卡、數值截斷、底部遮擋及截圖驗證。

## 主要尺寸

### 共用與桌面

- 主內容上方 padding：40px → 22px。
- 搜尋卡 padding：16px 18px → 14px 16px。
- 搜尋輸入框與按鈕：44px。
- 搜尋卡至 Part Popularity 間距：28px → 14px。
- 排行榜面板間距：16px → 12px。
- 面板標題列：44px。
- 表頭：34px。
- 單行排名列：44px。
- 中英文排名列：50px；手機使用 54px。
- 桌面詳細列表列高：46px。

### 手機

- 主內容頂部 padding：76px → 62px。
- 搜尋卡高度：144px → 約 115px（375／390px）。
- 搜尋卡 padding：12px；輸入框 44px。
- 分類與詳細頁頁籤：44px。
- 摘要卡：70px 高、6px 間距、9px 10px padding。
- 完整配置／固鎖／軸心列：最小 60px、10px 12px padding。
- 配置主名稱 14px；數值列 11px，數值不換行。

## 同尺寸前後可見資料筆數

以下為不計入固定底部導覽遮擋區、完整出現在首屏內的第一個排行榜資料列：

| 尺寸 | 調整前 | 調整後 |
|---|---:|---:|
| 375 × 812 | 3 | 5 |
| 390 × 844 | 3 | 6 |
| 430 × 932 | 5 | 7 |
| 768 × 1024 | 7 | 10 |
| 1280 × 720 | 4 | 6 |
| 1440 × 900 | 7 | 10 |

390 × 844 的魔導神杖完整配置首屏可見列由 4 筆增加為 6 筆；摘要卡高度由 77.5px 降為 70px，仍維持三欄同列。

## 底部導覽安全區

手機競賽頁由 `.stats-main` 使用 `calc(76px + env(safe-area-inset-bottom))` 作為底部 padding，並針對競賽頁取消重複的 body padding。實測固定導覽高度 64px，主內容至少保留 12px 加安全區；展開 120 筆排行榜並捲到底後，最後一筆可完整停在導覽列上方。沒有固定空白 div 或單一裝置高度。

## 實際驗證

- 375 × 812、390 × 844、430 × 932：單一排行榜、無水平溢出、四個分類頁籤均為 44px。
- 768 × 1024、1280 × 720：四個排行榜同時存在並以 2 × 2 排列。
- 1440 × 900：四欄排行榜同時顯示，完整 Top 10 可見。
- 375px 詳細頁三張摘要卡仍同列，Top Cuts `5,750` 不換行。
- 完整配置、固鎖與軸心的所有數值欄均未截斷。
- 軸心仍只顯示縮寫；配置仍為「中文上蓋＋固鎖＋軸心縮寫」。
- 搜尋、鍵盤操作、路由、重新整理、返回與展開全部功能均通過。

## 測試與建置

- 完整測試：43／43 通過；原有 42 項全部保留並通過。
- 正式靜態 build：28 個檔案，PASS。
- 結構檢查：11 份文件、12 個模組、5 個根 JSON、112 個本機引用，PASS。
- 客觀統計 SHA-256：`22139a94cc3c8e8ad6fc3672c5e41b1b97aabeecb1752801a80decf1607e05d4`，前後一致。
- 完整 `competitionStatistics` SHA-256：`398943f9734120213fcf37d0c7790d9ff713edaabc26884bd86154c0f12d7153`，前後一致。

## 截圖

- `artifacts/competition-stats/density-after-375x812.png`
- `artifacts/competition-stats/density-after-390x844.png`
- `artifacts/competition-stats/density-after-430x932.png`
- `artifacts/competition-stats/density-after-768x1024.png`
- `artifacts/competition-stats/density-after-1280x720.png`
- `artifacts/competition-stats/density-after-1440x900.png`
- `artifacts/competition-stats/density-after-mobile-bits-390x844.png`
- `artifacts/competition-stats/density-wizard-combos-390x844.png`
- `artifacts/competition-stats/density-wizard-bits-390x844.png`

對照截圖以相同檔名的 `density-before-*` 保留於同一 artifacts 目錄。

## 保護確認

名稱主資料、統計資料、搜尋邏輯、路由、Tier、推薦器、收藏、庫存、歷史紀錄、產品資料及週六／週日排程均未修改。沒有推送、部署或上線。
