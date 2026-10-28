# AI 工作交接

本文件只記錄可供下一位執行者接手的摘要，不保存聊天逐字稿。最新紀錄置頂。

## 協調狀態

- 目前執行者：無（等待使用者確認）
- 寫入範圍：目前沒有進行中的寫入任務
- Git 狀態（開始時）：`main` 與 `origin/main` 同步，工作樹乾淨

> 「目前執行者」僅供協調，不是可靠的檔案鎖。開始寫入前仍必須檢查 `git status`，並確認沒有其他 AI 或使用者正在修改同一工作樹。

## 紀錄格式

每次完成實質修改後新增一筆，保持精簡：

```markdown
### YYYY-MM-DD — Codex / Claude
- 任務：
- 修改檔案：
- 主要內容：
- 測試：
- 未完成事項：
- 已知問題：
- Git：未 commit / commit `<hash>`
- Deploy：未部署 / 已部署 `<環境>`
```

## 最新紀錄

### 2026-10-28 — Codex

- 任務：建立 Codex × Claude 雙 AI 協作維護機制。
- 修改檔案：`README.md`、`AGENTS.md`、`CLAUDE.md`、`docs/PROJECT_ARCHITECTURE.md`、`docs/AI_HANDOFF.md`、`docs/PROJECT_DECISIONS.md`。
- 主要內容：整理現況架構、權威開發規範、Claude 入口、交接格式與已確認決策；網站程式、CSS、Firebase Rules 與部署設定均未修改。
- 測試：`node --test` 86/86 PASS；`scripts/validate-site.mjs` PASS；`scripts/build-site.mjs` PASS；`git diff --check` PASS。
- 未完成事項：等待使用者確認協作文件。
- 已知問題：正式業務資料目前只存 Firestore；localStorage 只保存 UI 偏好，與部分舊描述中的「本機資料同步」概念不同。
- Git：未 commit。
- Deploy：未部署。
