/**
 * 占位首页 —— 前端同学替换为正式上传页。
 * 后端接口已可用，见 doc/API契约.md
 */
export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui", padding: 40 }}>
      <h1>StyleSlice</h1>
      <p>后端接口已就绪：POST /api/upload · POST /api/analyze · /api/styles</p>
    </main>
  );
}
