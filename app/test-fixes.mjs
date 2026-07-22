// 针对 code review findings 的回归测试
import fs from "fs";

const BASE = "http://localhost:3000";
let failed = 0;
function check(name, cond) {
  console.log(`${cond ? "✅" : "❌"} ${name}`);
  if (!cond) failed++;
}

/* P1-1: PATCH 忽略客户端 markdown，始终重渲染 */
const analysis = await fetch(`${BASE}/api/analyze`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ imageIds: ["image_demo1"], demo: true }),
}).then((r) => r.json());
const saved = await fetch(`${BASE}/api/styles`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(analysis),
}).then((r) => r.json());
const patched = await fetch(`${BASE}/api/styles/${saved.styleId}`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ...saved, name: "改名", markdown: "# 伪造的旧MD" }),
}).then((r) => r.json());
check("P1-1 PATCH 忽略客户端旧 markdown", patched.markdown.startsWith("# 改名"));
await fetch(`${BASE}/api/styles/${saved.styleId}`, { method: "DELETE" });

/* P1-2 + P2-1: 非法 / 不存在 imageId */
const badId = await fetch(`${BASE}/api/analyze`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ imageIds: ["../../../etc/passwd"] }),
});
check("P1-2 路径穿越 ID 返回 400", badId.status === 400);
const ghostId = await fetch(`${BASE}/api/analyze`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ imageIds: ["image_000000000000"] }),
});
check("P2-1 不存在的图片返回 404 而非 demo", ghostId.status === 404);

/* P2-2: 上传全部失败返回 422 */
const fd = new FormData();
fd.append("files", new Blob([Buffer.from("x")], { type: "image/gif" }), "a.gif");
const upAll = await fetch(`${BASE}/api/upload`, { method: "POST", body: fd });
check("P2-2 全部失败返回 422", upAll.status === 422);

/* P2-3: styles.json 损坏时列表应报错而不是静默清空 */
const FILE = "data/styles.json";
const backup = fs.existsSync(FILE) ? fs.readFileSync(FILE) : null;
fs.writeFileSync(FILE, "{broken json");
const listRes = await fetch(`${BASE}/api/styles`);
check("P2-3 损坏的 styles.json 不报 200", listRes.status !== 200);
if (backup) fs.writeFileSync(FILE, backup);
else fs.unlinkSync(FILE);
const recovered = await fetch(`${BASE}/api/styles`);
check("P2-3 恢复后列表正常", recovered.status === 200);

console.log(failed === 0 ? "\n全部通过 🎉" : `\n${failed} 项失败`);
process.exit(failed === 0 ? 0 : 1);
