# 戰鬥陀螺管理器（Beyblade Manager）

正式網站：<https://k89150-art.github.io/Beyblade-manager/>

這是一個已上線運作的 Beyblade X 收藏、零件庫存、配置、競賽統計與賽事紀錄管理網站。專案採原生 HTML、CSS、JavaScript，並使用 Firebase Authentication 與 Cloud Firestore 保存使用者資料。

## 專案文件

開始修改前，請依序閱讀：

1. [`AGENTS.md`](AGENTS.md)：所有 AI 與開發者必須遵守的主要規範。
2. [`docs/AI_HANDOFF.md`](docs/AI_HANDOFF.md)：最新工作狀態與交接紀錄。
3. [`docs/PROJECT_ARCHITECTURE.md`](docs/PROJECT_ARCHITECTURE.md)：目前實際架構與資料流。
4. [`docs/PROJECT_DECISIONS.md`](docs/PROJECT_DECISIONS.md)：已確認、不得任意推翻的決策。
5. [`CLAUDE.md`](CLAUDE.md)：Claude 的專案入口指引。

`AGENTS.md` 是開發規範的唯一主要來源；其他文件不重複維護同一套規則。

## 本機檢查

本專案沒有 `package.json`，不需要安裝 npm 套件。建議使用 Node.js 20 或相容版本執行：

```powershell
node --test tests/catalog-name-merge.test.mjs tests/competition-statistics.test.mjs tests/help-pages.test.mjs tests/manager-ui-refresh.test.mjs tests/retirement.test.mjs
node --experimental-vm-modules scripts/validate-site.mjs
node scripts/build-site.mjs
git diff --check
```

`scripts/build-site.mjs` 會將檢查後的靜態檔案輸出到被 Git 忽略的 `.site-build/`；該資料夾不是部署來源，也不得提交。
