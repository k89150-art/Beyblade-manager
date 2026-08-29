# 飛龍凌空／天馬爆擊 canonical 修正報告

完成日期：2026-08-29

## 穩定身分

- `HOVER_WYVERN`：官方繁體中文「飛龍凌空」，英文 `Hover Wyvern`。
- `PEGASUS_BLAST`：官方繁體中文「天馬爆擊」，英文 `Pegasus Blast`。

兩者各只有一筆 canonical 主紀錄、一筆 `__v18.bladesTop30` 相容紀錄與一筆 blade alias 紀錄。`Hover Wyvern` 沒有與既有 `Wyvern Hover` 合併；`Pegasus Blast` 沒有與 `Aero Pegasus`、Blast 主戰刃或其他 Pegasus 上蓋合併。

## 資料同步

- canonical 主資料補齊 `canonicalId`、`id`、`displayNameZh`、`name`、`name_en`、`referenceNameEn`、`model`、`aliases`、`inventoryIdentityKeys`。
- `__v18.bladesTop30` 同步正式中文、英文、canonicalId、aliases、庫存身分鍵及可見／搜尋狀態。
- aliases 同步中文、英文、URL slug 與 canonicalId；沒有新增模糊拼法或自行翻譯名稱。
- MetaBeys `Hover Wyvern` 與 `Pegasus Blast` 由 unmatched 改為 exact。
- Beywatch `Hover Wyvern` 由 unmatched 改為 exact。
- Beywatch 沒有獨立的 `Pegasus Blast` 上蓋頁；既有 Blast 頁內的 `Pegasus Blast ...` 配置仍保留原文，畫面則由精確 canonical 前綴格式化為「天馬爆擊 …」。沒有複製或虛構一份 Beywatch 統計頁。

## 身分報告

- exactMatches：1140 → 1143。
- unresolvedCount：206 → 203。
- 顯示層尚無已驗證繁中名稱的上蓋身分：159 → 157。
- 無法驗證縮寫的軸心來源名稱：維持 13。

## 統計完整性

- 排名、Appearances、Popularity、Unique Events、Unique Players、Usage、Pick %、1st Rate、Top Cuts 及原始 combo 均未改寫。
- 排除 `canonicalId` 與 `identityMatchStatus` 後的 MetaBeys／Beywatch 客觀來源資料 SHA-256，修正前後均為：`22139a94cc3c8e8ad6fc3672c5e41b1b97aabeecb1752801a80decf1607e05d4`。
- 身分報告更新後的完整 `competitionStatistics` SHA-256：`398943f9734120213fcf37d0c7790d9ff713edaabc26884bd86154c0f12d7153`。

## 功能保護

Tier、推薦器、原裝配置、收藏、庫存、歷史紀錄及週六／週日排程均未修改。沒有推送、部署或上線。

## 驗證結果

- 完整測試：42／42 通過；原有 37 項全部通過，新增 5 組涵蓋 16 項要求的 canonical、衝突防護、配置格式及資料雜湊驗證。
- 正式靜態 build：通過，共 28 個檔案；11 份文件、12 個模組、5 個根 JSON 與 112 個本機引用均有效。
- 桌面 1280 × 900 與手機 390 × 844：無水平溢出、無瀏覽器執行錯誤。
- `飛龍凌空`、`Hover Wyvern`、`HOVER_WYVERN` 均進入 `#/blades/hover-wyvern`；重新整理通過。
- `天馬爆擊`、`Pegasus Blast`、`PEGASUS_BLAST` 均進入 `#/blades/pegasus-blast`；重新整理通過。
- `Hover Wyvern 9-60K` 顯示為 `飛龍凌空 9-60 K`。
- Blast 來源頁中的 `Pegasus Blast Heavy 9-60K` 顯示為 `天馬爆擊 Heavy 9-60 K`。

## 截圖

- `artifacts/competition-stats/rankings-1280x900.png`
- `artifacts/competition-stats/confirmed-hover-wyvern-detail-390x844.png`
- `artifacts/competition-stats/confirmed-pegasus-blast-detail-390x844.png`
- `artifacts/competition-stats/confirmed-pegasus-combo-display-390x844.png`
