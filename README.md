# ⚡ 闪电侠 · 电费管理系统

面向企业 **30 台生产设备独立电表** 的日常抄表、自动核算与月度汇总系统。替代人工台账，实现
「一人一码、一设备一电表、每日独立填报、系统自动计算」，杜绝人工计算误差。

> **v2 架构（本仓库当前形态）**：参考 `qrcts` 项目的「纯静态前端 + 外链数据库」模式——
> **前端纯静态托管在 GitHub Pages（免费），数据层用 Supabase（Postgres + Auth + RLS + RPC，免费层）**。
> 浏览器在 `github.io` 页面上直接跨域调用 `*.supabase.co`，无需任何常驻后端容器，整体 **0 元运行**。

---

## 一、核心能力（对照需求）

| 需求 | 实现 |
| --- | --- |
| 一设备一码一责任人 | 每台电表生成**长期有效专属二维码**，落地到 GitHub Pages 抄表页，绑定设备（一人一码一设备） |
| 扫码自动填表 | 扫码后自动填充**填报日期 / 设备编号 / 设备名称 / 电表编号 / 抄表责任人**，全部只读 |
| 仅需人工填一项 | 仅「当日电表读数」需人工输入，正数校验 |
| 当日单次填报 | 同一电表当日重复扫码提交 → 提示「当日已完成抄表，无需重复填报」 |
| 每日电量核算 | `每日电量 = (当日读数 − 昨日读数) × 倍率`（系统自动留存昨日读数） |
| 每日电费核算 | `每日电费 = 每日电量 × 当期电单价`（单价后台可调，自动生效） |
| 异常拦截 | 当日读数 < 昨日读数 → 禁止提交，提示「当日读数低于昨日读数，请核对电表数据」 |
| 每日归档 | 读数/昨日读数/倍率/电量/电费/日期/填报人全部自动入台账 |
| 月度汇总 | 按自然月汇总单台设备 + 全厂整体总电量、总电费 |
| 筛选查询 | 后台按设备 / 电表 / 日期 / 月份 / 填报人精准筛选 |
| Excel 导出 | 每日明细、月度汇总一键导出（浏览器端生成 .xlsx） |
| 权限管理 | 抄表员仅能查看本人设备数据；管理员可改倍率/电价/绑定人/导出 |

> 所有核算与拦截逻辑均在 Supabase 的 **RPC 函数**（`submit_reading` 等）中完成，
> 权限由数据库 **RLS + `is_admin()`** 控制，公开抄表走 `anon` 可调用的 RPC，后台操作需登录。

---

## 二、技术栈

- **前端**：React 18 · TypeScript · Vite · Ant Design 5 · `@supabase/supabase-js` · `qrcode` · `xlsx`
- **后端/数据**：Supabase（PostgreSQL + Auth + Row Level Security + RPC）
- **部署**：GitHub Pages（自动部署）+ GitHub Actions
- **认证**：Supabase Auth（邮箱/密码；账号映射为 `用户名@sd.local`）

---

## 三、目录结构

```
dianfei/
├── frontend/                # 前端（部署到 GitHub Pages）
│   ├── public/env-config.js # 运行时配置：Supabase 地址/密钥/落地地址（改它无需重新构建）
│   ├── src/
│   │   ├── lib/supabase.ts  # supabase 客户端初始化
│   │   ├── api.ts           # 全部数据操作（supabase-js 查询 / RPC 封装）
│   │   ├── pages/Login.tsx           # 后台登录 / 注册
│   │   ├── pages/MeterPage.tsx       # 公开扫码抄表页（免登录）
│   │   └── pages/admin/              # 月度汇总 / 设备倍率 / 台账 / 二维码
│   ├── package.json
│   └── index.html
├── supabase/
│   ├── init_database.sql    # 建表 + RLS + 全部 RPC 函数（在 Supabase SQL Editor 执行一次）
│   └── seed.mjs             # 一次性种子：1 管理员 + 30 设备 + 30 抄表员（service_role 运行）
├── archive/                 # v1 FastAPI 后端（已废弃，仅作历史参考）
└── .github/workflows/       # GitHub Pages 自动部署
```

---

## 四、首次部署（三步）

### 1) 创建 Supabase 项目
到 [supabase.com](https://supabase.com) 新建项目（免费层即可）。记下：
- Project URL（`https://xxxx.supabase.co`）
- `anon` / `publishable` key（公开密钥，可放前端）
- `service_role` key（**机密**，仅本地种子脚本使用，**切勿提交**）

### 2) 初始化数据库（二选一）

**方式 A · 控制台（最直观）**：在 Supabase 控制台 **SQL Editor** 中粘贴执行 `supabase/init_database.sql`（一次即可）。
该脚本会建表、开启 RLS、创建全部 RPC 函数，并写入默认电单价 0.85。

**方式 B · 一键（GitHub Actions）**：本仓库含 `.github/workflows/setup-db.yml`，
在仓库 **Settings → Secrets** 配置 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` 后，
到 **Actions → Setup Supabase DB → Run workflow** 点一次即可自动完成「建库 + 种子」。
（适合本机网络无法直连 Supabase 的情况——CI 云端运行器可正常访问。）

### 3) 种子账号与设备（可选，二选一）
- 走方式 B 已自动完成（admin + 30 设备 + 30 抄表员）。
- 或本地运行一次：
```bash
cd supabase
export SUPABASE_URL="https://xxxx.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJ..."
npm install            # 首次（已附 package.json）
node seed.mjs
```
脚本创建 `admin / admin123` 与 `reader01 ~ reader30 / reader123`，并生成 30 台设备（一人一码一设备）。
已存在则跳过，可重复执行。

### 4) 配置前端并部署
编辑 `frontend/public/env-config.js`，填入你的 Supabase URL / anon key，以及
`PUBLIC_BASE_URL`（扫码落地地址，如 `https://你的用户名.github.io/shandianxia/#`）。
推送 `main` 即由 GitHub Actions 自动构建并发布到 Pages。

> 也可不执行第 3 步，直接在登录页「注册新账号」逐个人工创建；管理员权限需由已有管理员在 Supabase 中调整。

> ⚠️ **国内访问提示**：Supabase 免费版托管在海外（AWS），部分大陆网络访问 `*.supabase.co` 可能偏慢或不稳定。
> 若你和 30 位抄表员的网络能正常打开 `qrcts` 等同类站点，则当前架构可直接用；若读者反馈扫码页打不开/数据加载慢，
> 再考虑国内替代（Supabase 自托管、或前端改连 Cloudflare D1 + Workers）。当前仓库已尽量把配置外置（env-config.js），迁移成本可控。

---

## 五、本地开发

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```
前端读取 `public/env-config.js` 连接 Supabase，无需本地后端。

---

## 六、使用流程

1. 管理员登录后台 → **设备与倍率**：确认 30 台设备、倍率、绑定抄表责任人（一人一码）。
2. 管理员 → **二维码生成**：下载/打印每台设备的专属二维码，张贴于对应设备旁。
3. 抄表员每天到点，用手机扫描**自己负责设备**的二维码 → 系统自动带出日期/设备/责任人 →
   填写当日读数 → 提交。系统自动算电量、电费并归档（逻辑在 Supabase RPC 中执行）。
4. 管理员 → **抄表台账** 筛选查询、导出 Excel；**月度汇总** 查看/导出全厂与各设备月度数据。

---

## 七、业务规则（系统自动，零人工计算）

- 填报日期由服务端（Supabase）取当日，前端只读。
- 每日电量 = (当日读数 − 昨日读数) × 倍率；昨日读数由系统自动留存比对。
- 每日电费 = 每日电量 × 当期电单价；电价调整后立即作用于后续核算。
- 异常拦截：当日读数 < 昨日读数 → 禁止提交。
- 同一电表当日仅允许一次填报（唯一约束 + RPC 拦截）。

---

## 八、安全说明

- `anon` key 设计为可公开在前端；真实权限由数据库 **RLS** 与 RPC 内的 `is_admin()` 保证。
- 公开抄表 RPC `submit_reading` 仅允许 `anon` 调用，且仅写入读数，不含任何管理操作。
- 后台增删改 RPC 已 `REVOKE EXECUTE FROM anon`，仅 `authenticated` 可调用并内置管理员校验。
- `service_role` key 仅在本地种子脚本使用，切勿提交或暴露。
