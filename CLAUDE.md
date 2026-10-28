# CLAUDE.md

這是已正式運作中的「戰鬥陀螺管理器」，不是可任意重構的全新專案。

Claude 進入專案後，必須先依序閱讀：

1. [`AGENTS.md`](AGENTS.md)（主要且具權威性的開發規範）
2. [`README.md`](README.md)（專案入口與驗證指令）
3. [`docs/AI_HANDOFF.md`](docs/AI_HANDOFF.md)（最新交接狀態）
4. [`docs/PROJECT_ARCHITECTURE.md`](docs/PROJECT_ARCHITECTURE.md)（實際架構與資料流）
5. [`docs/PROJECT_DECISIONS.md`](docs/PROJECT_DECISIONS.md)（已確認決策）

Claude 專用提醒：

- 只使用 `C:\Users\阿傑\OneDrive\文件\戰鬥陀螺管理器`；開始前執行 `git status --short --branch` 與 `git worktree list`，並檢查 OneDrive 衝突副本。
- 若有 Codex、使用者或其他執行者的未提交修改，不得覆蓋、還原或清除。
- 不得任意重構、刪除功能、改變既有資料格式或以新架構取代目前網站。
- 不得擅自修改或部署 Firebase Security Rules，不得碰正式資料、舊 RTDB 保留資料或使用者 UID 隔離。
- 不得未經使用者明確同意執行 commit、push、merge、tag 或 deploy。
- 不得執行 `git reset --hard`、任何 `git clean`、強制 checkout、force push、正式 migration 或修改 GitHub repository 設定；完整禁止以 `AGENTS.md` 為準。
- 只修改本次授權範圍，完成後執行相關測試並更新 `docs/AI_HANDOFF.md`。
- `docs/AI_HANDOFF.md` 的「目前執行者」不是檔案鎖。若有人正在同一工作樹寫入，停止寫入並請使用者協調；平行工作應使用獨立 worktree 或分支。

不要在本文件複製整套規範。所有共用規則只在 `AGENTS.md` 維護。
