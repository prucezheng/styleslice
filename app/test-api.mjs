// 端到端 API 测试（Node 原生 fetch，UTF-8 无编码问题）
const BASE = "http://localhost:3000";
let failed = 0;

function check(name, cond) {
  console.log(`${cond ? "✅" : "❌"} ${name}`);
  if (!cond) failed++;
}

// 1. 分析（demo 模式）
const analysis = await fetch(`${BASE}/api/analyze`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ imageIds: ["image_demo1", "image_demo2"], demo: true }),
}).then((r) => r.json());
check("analyze 返回风格名称", analysis.name === "暖调极简编辑风");
check("analyze 返回 4 个颜色", analysis.colors?.length === 4);
check("analyze 标记 fallback", analysis.fallback === true);
check("analyze 生成 MD（含禁止项章节）", analysis.markdown?.includes("## 11. 明确禁止项"));

// 2. 保存
const saved = await fetch(`${BASE}/api/styles`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(analysis),
}).then((r) => r.json());
check("保存返回 styleId", !!saved.styleId);
check("保存 version=1", saved.version === 1);

// 3. 列表与详情
const list = await fetch(`${BASE}/api/styles`).then((r) => r.json());
check("列表包含新风格", list.styles.some((s) => s.styleId === saved.styleId));
const detail = await fetch(`${BASE}/api/styles/${saved.styleId}`).then((r) => r.json());
check("详情名称正确", detail.name === "暖调极简编辑风");

// 4. 更新（MD 应同步重渲染）
const patched = await fetch(`${BASE}/api/styles/${saved.styleId}`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "改名后的风格" }),
}).then((r) => r.json());
check("更新 version=2", patched.version === 2);
check("MD 同步更新标题", patched.markdown.startsWith("# 改名后的风格"));

// 5. 删除
await fetch(`${BASE}/api/styles/${saved.styleId}`, { method: "DELETE" });
const after = await fetch(`${BASE}/api/styles`).then((r) => r.json());
check("删除生效", !after.styles.some((s) => s.styleId === saved.styleId));

// 6. 错误处理
const bad = await fetch(`${BASE}/api/analyze`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{}",
});
check("缺少 imageIds 返回 400", bad.status === 400);
const notFound = await fetch(`${BASE}/api/styles/style_nonexist`);
check("不存在风格返回 404", notFound.status === 404);

console.log(failed === 0 ? "\n全部通过 🎉" : `\n${failed} 项失败`);
process.exit(failed === 0 ? 0 : 1);
