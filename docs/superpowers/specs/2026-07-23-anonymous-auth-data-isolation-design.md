# StyleSlice 匿名登录与用户数据隔离设计

日期：2026-07-23

## 目标

为 StyleSlice MVP 增加 Supabase 匿名登录，使每个浏览器会话获得独立的 Supabase 用户 ID，并在 PostgreSQL 与 Storage 两层强制隔离用户数据。

成功标准：

- 用户无需填写邮箱即可开始使用。
- 用户只能列出、读取、创建、修改和删除自己的风格记录。
- 用户只能上传和读取自己目录下的原图。
- 即使客户端伪造 `style_id`、`image_id` 或直接调用 Supabase API，也无法访问其他用户的数据。
- 清除浏览器数据、退出匿名会话或更换设备后，用户无法恢复原匿名账户；这是 MVP 的已知限制。

## 当前问题

当前实现由服务端使用 `SUPABASE_SERVICE_ROLE_KEY` 访问 Supabase。`service_role` 会绕过 RLS，因此不能作为面向用户请求的常规数据客户端。

此外：

- `styles` 表没有 `user_id`。
- 风格列表查询会返回表内全部记录。
-详情、更新和删除只检查 `style_id`。
- `uploads` 是 Public bucket，文件位于 bucket 根目录。
- 图片读取接口不验证用户身份，并返回长期 public cache 响应。

## 方案比较

### 方案 A：客户端直接访问数据库与 Storage

匿名登录后，浏览器使用 publishable/anon key 直接操作 Supabase，完全依赖 RLS。

优点是链路短、RLS 使用自然；缺点是需要较大幅度重写现有 Next.js API，AI 分析仍然需要服务端读取图片。

### 方案 B：保留 Next.js API，服务端使用用户 JWT 访问 Supabase（采用）

浏览器只负责匿名登录，并把 Access Token 放入 API 请求的 `Authorization` header。服务端验证用户，并创建携带该 JWT 的用户级 Supabase client。数据库和 Storage 查询继续经过 RLS。

优点是保持现有 API 边界、密钥与 AI 调用留在服务端，同时让数据库成为最终授权边界；改动范围适合当前 MVP。

### 方案 C：继续使用 service role，在代码中手动加 `user_id` 条件

改动最少，但任何漏写条件的接口都会跨用户泄露，且 Storage 同样需要手工授权。该方案不作为用户请求的安全边界。

## 认证架构

新增浏览器 Supabase client，使用：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` 或 Supabase publishable key

应用加载流程：

1. 读取现有 Supabase session。
2. 如果 session 不存在，调用 `signInAnonymously()`。
3. 登录成功后才加载风格列表或允许上传。
4. 所有 `/api/*` 用户请求携带 `Authorization: Bearer <access_token>`。
5. Access Token 刷新后，后续请求使用最新 token。

匿名登录初始化失败时，页面显示可重试错误，不退化为共享公共身份。

## 服务端授权边界

新增统一认证模块，职责如下：

- 从请求读取 Bearer token。
- 使用 Supabase Auth 校验 token 并取得可信的 `user.id`。
- 创建带用户 JWT 的 Supabase client，使数据库与 Storage 查询应用 RLS。
- token 缺失或无效时统一返回 `401`。

面向用户的风格与图片操作不得使用 `service_role`。`service_role` 只允许用于明确的后台维护任务，例如清理过期匿名账户，并且不进入浏览器 bundle。

对于属于其他用户但 ID 格式合法的资源，接口统一返回 `404`，避免泄露资源是否存在。

## PostgreSQL 模型

`styles` 表增加：

```sql
user_id uuid references auth.users(id) on delete cascade
```

新记录必须写入当前 `auth.uid()`。为避免破坏现有数据，迁移不删除历史记录；历史记录的 `user_id` 保持 `null`，启用 RLS 后对普通用户不可见。确认无需保留后可单独清理，再考虑设置列级 `NOT NULL`。

对 `styles` 启用 RLS，并为 `authenticated` 角色创建四类策略：

- `SELECT USING ((select auth.uid()) = user_id)`
- `INSERT WITH CHECK ((select auth.uid()) = user_id)`
- `UPDATE USING ... WITH CHECK ...`
- `DELETE USING ((select auth.uid()) = user_id)`

为 `user_id` 和常用排序字段建立索引，例如 `(user_id, updated_at desc)`。

匿名 Supabase 用户属于 `authenticated` 数据库角色，而不是未登录请求使用的 `anon` 角色。MVP 不需要在 RLS 中区分匿名用户与永久用户。

## Storage 模型

`uploads` 改为 Private bucket。新对象路径固定为：

```text
<auth.uid()>/<image_id>.<ext>
```

`storage.objects` 的 `SELECT`、`INSERT` 和 `DELETE` 策略同时检查：

- `bucket_id = 'uploads'`
- 路径第一段等于当前 `auth.uid()`，或对象 `owner_id` 等于当前用户

上传不再返回 public URL，而返回 `imageId` 与应用内受保护地址 `/api/images/<imageId>`。服务端读取图片时只在当前用户目录下查找。

历史根目录对象不会删除；bucket 改为 Private 后，普通用户无法访问它们。

## API 调整

以下接口全部要求有效匿名或永久用户 session：

- `POST /api/upload`
- `POST /api/analyze`
- `GET /api/images/:id`
- `GET/POST /api/styles`
- `GET/PATCH/DELETE /api/styles/:id`

存储层函数接收用户级 Supabase client 和可信 `userId`，不再自行创建全局 service-role client。

主要签名变化：

- `saveUpload(client, userId, buffer, mime)`
- `readUpload(client, userId, imageId)`
- `listStyles(client, userId)`
- `getStyle(client, userId, styleId)`
- `createStyle(client, userId, input)`
- `updateStyle(client, userId, styleId, patch)`
- `deleteStyle(client, userId, styleId)`

即使 RLS 已经生效，查询仍显式带 `user_id = userId`，用于表达意图和改善查询计划；真正的安全边界仍是 RLS。

图片接口响应使用私有缓存语义，例如 `Cache-Control: private, no-store`，不再使用 public immutable cache。

## 数据流

```text
浏览器打开应用
  -> 恢复 session 或匿名登录
  -> 得到 Access Token 和 user.id
  -> 带 Bearer token 调用 Next.js API
  -> API 校验 token
  -> 创建用户级 Supabase client
  -> PostgreSQL / Storage 执行 RLS
  -> 只返回当前用户数据
```

分析流程仍在服务端调用 Ark。服务端使用当前用户的 Supabase client 读取图片，因此即使请求体伪造其他用户的 `imageId`，Storage RLS 或用户目录查找也会拒绝访问。

## 错误处理

- 未登录、token 过期或校验失败：`401`，客户端刷新/重建 session 后允许重试一次。
- 资源不属于当前用户：`404`。
- RLS/Storage 拒绝：服务端记录内部错误，客户端不显示策略细节。
- 匿名登录受限或遭 CAPTCHA 拦截：显示明确重试提示。
- 用户清除浏览器数据：创建新的匿名账户，不自动合并旧数据。

## 滥用与生命周期

匿名注册可能被滥用。MVP 依赖 Supabase 自带 IP rate limit，并预留 Cloudflare Turnstile/CAPTCHA 接入点。正式公开推广前应启用 CAPTCHA。

Supabase 不自动清理匿名用户。后续通过受控后台任务清理超过约定期限且无保留价值的匿名账户；`styles.user_id on delete cascade` 负责清理数据库记录，Storage 对象需要独立清理流程。

## 测试与验收

### 自动化测试

- 没有 Bearer token 的每个受保护 API 返回 `401`。
- 无效 token 返回 `401`。
- 用户 A 无法读取、更新或删除用户 B 的 style ID。
- 用户 A 无法通过分析或图片接口读取用户 B 的 image ID。
- 用户 A 的列表只包含自己的记录。
- 上传路径第一段等于当前用户 ID。
- `npm run build` 通过。

### Supabase 集成验收

- 创建两个匿名 session A/B。
- A、B 分别上传图片并保存风格。
- 使用 A 的 JWT 直接请求 Data API 与 Storage，确认 B 的记录和对象不可见。
- 使用 B 重复反向验证。
- 确认历史 `user_id is null` 记录和旧根目录对象对两者均不可见。

## 不在本次范围

- 邮箱、手机或 OAuth 注册。
- 匿名账户跨设备恢复。
- 匿名账户与已有永久账户的数据合并。
- 团队共享、公开作品或协作权限。
- 自动清理任务的部署。

这些能力可以在匿名隔离稳定后独立设计。
