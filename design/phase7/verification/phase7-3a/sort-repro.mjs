// Phase 7-3a: reproduces the config sort issue with the real script.js (see README.md).
// Read-only: mock Firestore in memory, no network, no project files written.
// Run from the project root: node design/phase7/verification/phase7-3a/sort-repro.mjs
import { createMockFirestore, userDocPath } from "../../../../tests/helpers/mock-firestore.mjs";
import { createConfigPage, stockItem, configItem } from "../../../../tests/helpers/config-page-harness.mjs";

const cfg = (model, layer, fix, axis) => configItem([model, layer, "-", "-", "-", "-", "-", fix, axis], "-");
function seed(configTable) {
  const mock = createMockFirestore();
  mock.seed(userDocPath("user-a"), {
    updatedAt: 1, ownerUid: "user-a",
    beybladeTable: [stockItem("UX-01", "蒼龍爆刃", "1-60", "A"), stockItem("BX-01", "蒼龍神劍", "3-60", "F"), stockItem("BX-02", "地獄鐮刀", "4-60", "T")],
    partTable: [{ cells: ["固鎖", "3-60", "2"] }],
    configTable, historyTable: [{ model: "UX-01 CUSTOM", combo: "蒼龍爆刃", fix: "1-60", axis: "A", result: "測試", note: "", date: "", comboKey: "蒼龍爆刃|-|-|-|-|-|1-60|A" }]
  });
  return mock;
}
const order = rows => rows.map(r => r.cells[0] + "/" + r.cells[1]).join(", ");

async function scenario(name, configTable, action) {
  const mock = seed(configTable);
  const p = createConfigPage({ mock });
  p.signIn(); p.deliver(); await p.settle();
  await p.wait(250);
  console.log(`\n[${name}] screen after load+250ms: ${order(p.configRows().map(r => ({ cells: p.rowCells(r) })))}`);
  console.log(`  dirty after load+250ms: ${JSON.stringify(p.dirtyTables())}`);
  if (action) await action(p, mock);
  console.log(`  stored: ${order(p.stored().configTable)} | commits ${mock.stats.commits}`);
}

await scenario("sorted legacy", [cfg("UX-01 CUSTOM", "蒼龍爆刃", "1-60", "A"), cfg("BX-01 CUSTOM", "蒼龍神劍", "3-60", "F")]);
await scenario("unsorted legacy + unrelated part save", [cfg("BX-01 CUSTOM", "蒼龍神劍", "3-60", "F"), cfg("UX-01 CUSTOM", "蒼龍爆刃", "1-60", "A")], async (p, mock) => {
  p.context.createPartRow(["軸心", "F", "1"]);
  p.context.saveData(); await p.settle();
});
await scenario("addConfig then unrelated save", [cfg("BX-01 CUSTOM", "蒼龍神劍", "3-60", "F")], async (p, mock) => {
  p.openEditor(); p.build({ 上蓋: "蒼龍爆刃", 固鎖: "1-60", 軸心: "A" }); p.save(); await p.settle();
  console.log(`  stored right after addConfig: ${order(p.stored().configTable)}`);
  await p.wait(250);
  console.log(`  screen +250ms: ${order(p.configRows().map(r => ({ cells: p.rowCells(r) })))} dirty ${JSON.stringify(p.dirtyTables())}`);
  p.context.createPartRow(["軸心", "F", "1"]);
  p.context.saveData(); await p.settle();
  console.log("  last commit tables:", Object.keys(mock.commitLog.at(-1)[0]?.fields || mock.commitLog.at(-1)[0] || {}));
});
await scenario("restoreHistoryRow then unrelated save", [cfg("BX-01 CUSTOM", "蒼龍神劍", "3-60", "F")], async (p, mock) => {
  p.restoreHistory(p.historyRows()[0]); await p.settle();
  console.log(`  alerts ${JSON.stringify(p.effects.alerts)} stored right after restore: ${order(p.stored().configTable)}`);
  await p.wait(250);
  console.log(`  dirty +250ms ${JSON.stringify(p.dirtyTables())}`);
});
