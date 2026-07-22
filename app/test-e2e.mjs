// 完整链路测试：上传 test 图片 → 分析 → 保存
import fs from "fs";
import path from "path";

const BASE = "http://localhost:3000";
const DEMO_DIR = path.join(import.meta.dirname, "..", "demo");

async function main() {
  // 1. 上传图片
  console.log("📤 上传图片...");
  const fd = new FormData();
  for (const name of ["test1.jpg", "test2.jpg", "test3.jpg"]) {
    const buf = fs.readFileSync(path.join(DEMO_DIR, name));
    fd.append("files", new Blob([buf], { type: "image/jpeg" }), name);
  }
  const up = await fetch(`${BASE}/api/upload`, { method: "POST", body: fd }).then(r => r.json());
  console.log(`   成功 ${up.images.length} 张`, up.images.map(i => i.imageId));
  if (up.failures?.length) console.log("   失败:", up.failures);
  const imageIds = up.images.map(i => i.imageId);

  // 2. 分析
  console.log("🔍 AI 分析中（可能需 30-60 秒）...");
  const t0 = Date.now();
  const analysis = await fetch(`${BASE}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageIds, primaryImageIds: [imageIds[1]] }),
  }).then(r => r.json());
  console.log(`   耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`   风格: ${analysis.name}`);
  console.log(`   fallback: ${analysis.fallback}${analysis.fallbackReason ? " (" + analysis.fallbackReason + ")" : ""}`);
  console.log(`   关键词: ${analysis.keywords?.map(k => k.word).join("、")}`);
  console.log(`   颜色: ${analysis.colors?.map(c => c.hex).join(" ")}`);
  console.log(`   MD 长度: ${analysis.markdown?.length} 字`);

  // 3. 保存
  const saved = await fetch(`${BASE}/api/styles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(analysis),
  }).then(r => r.json());
  console.log(`💾 已保存: ${saved.styleId} (version ${saved.version})`);

  // 4. 验证资料库
  const list = await fetch(`${BASE}/api/styles`).then(r => r.json());
  console.log(`📚 资料库共 ${list.styles.length} 条`);
}

main().catch(e => { console.error("❌", e.message); process.exit(1); });
