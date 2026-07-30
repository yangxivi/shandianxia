# ⚡ 闪电侠 · 电费管理系统

面向企业 **30 台生产设备独立电表** 的日常抄表、自动核算与月度汇总系统。替代人工台账，实现
「一人一码、一设备一电表、每日独立填报、系统自动计算」，杜绝人工计算误差。

> 开发载体说明：本仓库即为可在 WorkBuddy 中落地的**完整可运行实现**，后端 FastAPI + SQLite + JWT，
> 前端 React18 + TypeScript + Vite + Ant Design 5，与你已有的「应付宝」技术栈一致。

---

## 一、核心能力（对照需求）

| 需求 | 实现 |
| --- | --- |
| 一设备一码一责任人 | 每台电表生成**长期有效专属二维码**（含 JWT 令牌），绑定设备 + 责任人，不可混淆 |
| 扫码自动填表 | 扫码后自动填充**填报日期 / 设备编号 / 电表编号 / 抄表责任人**，全部只读不可改 |
| 仅需人工填一项 | 仅「当日电表读数」需人工输入，正数 + 小数校验，禁止空/负提交 |
| 当日单次填报 | 同一电表当日重复扫码提示「当日已完成抄表，无需重复填报」 |
| 每日电量核算 | `每日电量 = (当日读数 − 昨日读数) × 倍率`（系统自动留存昨日读数） |
| 每日电费核算 | `每日电费 = 每日电量 × 当期电单价`（单价后台可调，自动生效后续核算） |
| 异常拦截 | 当日读数 < 昨日读数 → 禁止提交，提示「当日读数低于昨日读数，请核对电表数据」 |
| 每日归档 | 读数/昨日读数/倍率/电量/电费/日期/填报人全部自动入台账 |
| 月度汇总 | 按自然月汇总单台设备 + 全厂设备整体总电量、总电费 |
| 筛选查询 | 后台按设备 / 电表 / 日期 / 月份 / 填报人精准筛选 |
| Excel 导出 | 每日明细、月度汇总一键导出（财务对账 / 台账存档） |
| 权限管理 | 抄表员仅能填报本人电表 + 查看本人数据；管理员可改倍率/电价/绑定人/导出/改异常 |

---

## 二、技术栈

- **后端**：FastAPI · SQLAlchemy · SQLite · JWT(`python-jose`) · bcrypt · qrcode · openpyxl
- **前端**：React 18 · TypeScript · Vite · Ant Design 5 · axios · react-router-dom(HashRouter)

---

## 三、目录结构

```
dianfei/
├── backend/                 # 后端
│   ├── app/
│   │   ├── main.py          # 全部接口 + 核算/拦截/导出/二维码逻辑
│   │   ├── models.py        # User / Device / Reading / Config
│   │   ├── schemas.py       # Pydantic 契约
│   │   ├── security.py      # JWT + bcrypt
│   │   ├── db.py            # 引擎/会话
│   │   └── seed.py          # 初始化 1 管理员 + 30 设备 + 30 抄表员 + 默认电价
│   ├── electricity.db       # 运行生成的数据库（已 gitignore）
│   ├── requirements.txt
│   └── .env.example
└── frontend/                # 前端
    ├── src/
    │   ├── api.ts
    │   ├── App.tsx
    │   ├── pages/Login.tsx           # 后台登录
    │   ├── pages/MeterPage.tsx       # 公开扫码抄表页
    │   └── pages/admin/              # 月度汇总/设备倍率/台账/二维码
    ├── dist/                         # 构建产物（部署到 GitHub Pages）
    ├── package.json
    └── .env.example
```

---

## 四、本地运行

### 1) 后端

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate   # 可选
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

首次启动自动建表并写入种子数据。接口文档见 http://127.0.0.1:8000/docs

### 2) 前端（开发模式）

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173 ，已配置 /api 代理到 8000
```

> 开发模式下二维码链接默认指向 `http://localhost:5173/#/meter?token=...`

### 默认账号

| 角色 | 账号 | 密码 |
| --- | --- | --- |
| 管理员 | `admin` | `admin123` |
| 抄表员01 | `reader01` | `reader123` |
| … | `reader02` ~ `reader30` | `reader123` |

---

## 五、部署

### 前端 → GitHub Pages（自动部署）

仓库已内置 GitHub Actions 工作流 `.github/workflows/deploy-pages.yml`：推送 `main` 即自动构建并发布 `frontend/dist/` 到 Pages。

使用前两步：
1. 仓库 **Settings → Secrets and variables → Actions → New repository secret**，新建密钥 `VITE_API_BASE`，
   值为你的后端地址，例如 `https://your-backend.up.railway.app/api`（留空则前端走同域，仅适合前后端同域部署）。
2. 仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。

> QR 二维码落地地址由后端环境变量 `PUBLIC_BASE_URL` 决定（如 `https://yangxivi.github.io/shandianxia/#`），
> 需与前端部署地址一致，否则扫码打不开抄表页。

手动构建（本地验证）：`cd frontend && npm run build`（产物 `dist/`，已设 `base: "./"`）。

### 后端 → 任意可公网访问的服务（Railway / Render / 云服务器）

```bash
# 关键环境变量
JWT_SECRET=一段足够长的随机字符串
PUBLIC_BASE_URL=https://你的用户名.github.io/仓库名/#   # 二维码扫码落地地址，注意带 /#
```

`PUBLIC_BASE_URL` 决定生成的二维码指向哪里（必须带 `/#` 以匹配前端 HashRouter）。
后端需开放 8000 端口（或反向代理），并配置为常驻进程（如 `uvicorn app.main:app` + supervisor/systemd）。

> 说明：前端为纯静态站点可免费托管于 GitHub Pages；后端为有状态服务，需独立托管（你已在
> Railway/Render 之间验证过，任选其一常驻即可）。前后端通过 `VITE_API_BASE` 与 `PUBLIC_BASE_URL` 对接。

---

## 六、使用流程

1. 管理员登录后台 → **设备与倍率**：确认 30 台设备、倍率、绑定抄表责任人（一人一码）。
2. 管理员 → **二维码生成**：下载/打印每台设备的专属二维码，张贴于对应设备旁。
3. 抄表员每天到点，用手机扫描**自己负责设备**的二维码 → 系统自动带出日期/设备/责任人 →
   填写当日读数 → 提交。系统自动算电量、电费并归档。
4. 管理员 → **抄表台账** 筛选查询、导出 Excel；**月度汇总** 查看/导出全厂与各设备月度数据。

---

## 七、业务规则（系统自动，零人工计算）

- 填报日期由服务端取当日，前端只读，杜绝错填/漏填。
- 每日电量 = (当日读数 − 昨日读数) × 倍率；昨日读数由系统自动留存比对。
- 每日电费 = 每日电量 × 当期电单价；电价调整后立即作用于后续核算（历史记录保留当时单价快照）。
- 异常拦截：当日读数 < 昨日读数 → 禁止提交。
- 同一电表当日仅允许一次填报。
