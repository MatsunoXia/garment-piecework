# 服装厂计件工资管理系统

面向服装厂的计件生产与工资管理系统：一个微信小程序（员工 + 管理员共用）、一个 Web 管理后台、一套 NestJS API、一个 PostgreSQL 数据库。

核心目标：**准确、可靠地记录生产报工，并正确计算每名员工的计件工资。**

---

## 一、技术栈

| 模块 | 技术 |
|---|---|
| 微信小程序 | uni-app + Vue 3 + TypeScript |
| Web 管理后台 | Vue 3 + Vite + TypeScript + Vue Router |
| 后端 | NestJS 12（ESM） |
| 数据库 | PostgreSQL |
| ORM | Prisma 7 + `@prisma/adapter-pg` |
| 认证 | 微信登录 + JWT；Web 使用公司编号 + 管理密码 |
| 包管理 | pnpm workspace |

---

## 二、目录结构

```text
garment-piecework/
├── apps/
│   ├── api/            # NestJS API（全部业务规则）
│   │   ├── prisma/schema.prisma
│   │   ├── prisma/migrations/0001_settlement_recalculation.sql  # 待执行迁移
│   │   └── src/
│   ├── admin/          # Web 管理后台（管理员）
│   └── miniprogram/    # uni-app 小程序（员工与管理员共用）
├── docs/               # 需求、数据库、架构、实施计划、交付说明
├── AGENTS.md           # 项目开发规则
└── pnpm-workspace.yaml
```

---

## 三、已实现功能

### 3.1 API（全部业务规则在后端）

- 身份认证：微信 `code2session` 登录、JWT、多身份选择、刷新、本地开发登录（受开关控制）
- Web 登录：公司编号/名称 + 公司级管理密码（scrypt 哈希），仅创始管理员可设置
- 公司与管理员：创建公司（自动生成公司编号与公司NO）、改名、停用、管理员邀请（可多人使用）、停用管理员（保护最后一名）
- 员工：公司NO加入、管理员创建、编号原子分配、车间分配、启停用、微信重新绑定令牌
- 车间：增删改查；被款式引用时禁止删除并提示
- 款式：编号 `KYYYYMMNNN` 原子分配、生产范围（全公司/指定车间）、工序模板套用、完成、归档、状态只能向前
- 工序与工价：新增/改名/排序、工价三位小数、修改工价后同款全体重算（含已结算，迁移后生效）
- 捆号：最小可用编号分配、批量新增、Excel 预览+确认导入、有报工历史后锁定数量/码数、永久禁止删除
- 报工：员工单条/批量、管理员代报（立即通过）、待审核列表、单条/批量审核、驳回、删除、并发唯一约束
- 争议：发起、列表、三种处理结果（确认原员工/转给质疑员工/驳回原报工）、报工删除时自动终止争议
- 工资：按员工+款式计算，只统计 approved，数量取捆号，单价取当前工价，全程 Decimal
- 结算：员工+款式为单位、防重复、自动推进款式为已结算、结算修正（迁移后生效）
- 操作日志：追加式、只读查询，工价修改与结算重算留痕
- Swagger：`/api/docs`

### 3.2 Web 管理后台

工作台、员工、车间、款式（含工序工价/捆号/Excel 导入/报工/工资结算）、工序模板、报工审核、争议处理、工资统计、工资结算与修正、管理员与邀请、操作日志、公司设置。

### 3.3 小程序

**首次进入**：先选择身份，不预设角色。

- 我是老板 / 管理员：填写公司名称、自己的姓名（可选 Web 管理密码）→ 创建公司并成为创始管理员 → 展示公司编号与公司NO → 进入管理工作台
- 我是员工：填写姓名、公司NO → 加入公司 → 进入员工端
- 有管理员邀请：走邀请口令加入

**非首次进入**：启动时自动读取本地会话；即使本地会话失效，也会静默尝试微信登录，按已有账号身份直接进入管理员端或员工端。本地存在多个身份时才要求选择。

员工端：首页统计、报工（款式→工序→捆号，自动带数量）、我的报工、发起争议、我的工资明细、重新绑定微信。
管理员端：工作台、报工审核（批量）、争议处理、管理员代报、工资统计、工资结算。

---

## 四、快速开始

### 4.1 环境要求

- Node.js ≥ 22
- pnpm ≥ 10（仓库使用 pnpm 12 验证）
- 可用的 PostgreSQL，数据库 `garment_piecework` 已执行 V1.0 建表脚本

### 4.2 安装依赖

```bash
cd D:\workspace\workBuddy\garment-piecework
pnpm install
```

### 4.3 配置 API 环境变量

```bash
cd apps\api
copy .env.example .env
```

编辑 `apps\api\.env`（真实密钥不要提交到 Git）：

```ini
PORT=3000
DATABASE_URL="postgresql://用户:密码@localhost:5432/garment_piecework?schema=public"
JWT_SECRET=请替换为足够长的随机字符串
WECHAT_MINIPROGRAM_APPID=你的小程序AppID
WECHAT_MINIPROGRAM_SECRET=你的小程序AppSecret
ENABLE_DEV_LOGIN=false
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

### 4.4 生成 Prisma Client

```bash
cd apps\api
pnpm exec prisma generate
```

### 4.5 启动

```bash
# 根目录
pnpm dev:api      # http://localhost:3000/api ，文档 http://localhost:3000/api/docs
pnpm dev:admin    # http://localhost:5173
```

### 4.6 小程序

```bash
pnpm dev:mp       # 监听编译到 apps/miniprogram/dist/dev/mp-weixin
# 或
pnpm build:mp     # 生产构建到 apps/miniprogram/dist/build/mp-weixin
```

用微信开发者工具「导入项目」选择对应目录：

1. 填入你自己的小程序 AppID（`src/manifest.json` 中的 `touristappid` 仅用于占位）。
2. 「详情 → 本地设置」勾选**不校验合法域名**（本地 API 是 http://localhost）。
3. 真机调试时把 `apps/miniprogram/src/config.ts` 里的 `API_BASE_URL` 改成电脑局域网 IP。

---

## 五、本地登录方式

### 5.1 小程序（无微信 AppID 时）

1. 在 `apps/api/.env` 加 `ENABLE_DEV_LOGIN=true`，重启 API。
2. 首次进入页展开「本地开发调试」，输入任意 OpenID（如 `dev_boss_001`）并点击「使用该身份继续」。
3. 选择「我是老板」创建公司，或选择「我是员工」用老板提供的公司NO加入。
4. 提交表单时如果微信登录不可用，会弹出输入框让你填写本地开发 OpenID，继续完成流程。
5. 换一个 OpenID 可模拟另一名微信用户（如 `dev_emp_001`）；「清除本地登录」可重新走首次进入。
6. `ENABLE_DEV_LOGIN` 在 `NODE_ENV=production` 下强制失效。
7. 正式发布前把 `apps/miniprogram/src/config.ts` 的 `ENABLE_DEV_UI` 改为 `false`，隐藏开发入口。

> 公司NO 是员工加入专用的 8 位邀请码，不是 Web 登录用的 C 开头公司编号。公司编号相当于租户标识，不能单独作为加入凭证。

### 5.2 Web 管理后台

设置密码两种方式：

1. 在小程序首次进入选择「我是老板」创建公司时填写 **Web 管理密码**（推荐，创建公司即可用）；
2. 已登录小程序的管理员，在「管理工作台 → 设置 Web 管理密码」中设置（仅创始管理员）。

然后打开 http://localhost:5173 ，输入**公司编号**（创建公司后返回，也可在 Web「公司设置」查看）和管理密码。

> 说明：V1.0 数据库已有 `companies.admin_password_hash` 字段，因此 Web 采用公司级管理密码，不需要新增表。所有 Web 操作仍以具体管理员身份写入操作日志。

---

## 六、数据库迁移（重要，尚未执行）

当前数据库仍保留 V1.0 的以下限制：

- `settlements` 及明细的不可变触发器禁止任何更新/删除；
- 款式完成/结算后禁止修改工序（包括工价）；
- `settlements.total_amount` 为 `NUMERIC(14,2)`，与三位小数工价不一致。

因此**当前库可以完成**建公司、建款、捆号、报工、审核、争议、工资统计、首次结算；
**以下能力需要先执行迁移**：

- 工价修改后同步重算已结算金额；
- 修正已结算记录；
- 在款式 completed/settled 后修改工价。

迁移文件：`apps/api/prisma/migrations/0001_settlement_recalculation.sql`（含回滚脚本与说明）。

执行前必须：备份数据库 → 在测试库验证 → 由项目负责人确认。示例命令：

```bash
psql "postgresql://用户:密码@localhost:5432/garment_piecework" -f apps/api/prisma/migrations/0001_settlement_recalculation.sql
```

未执行迁移时，相关接口会返回 `STYLE_PROCESS_LOCKED` 或 `DB_MIGRATION_REQUIRED`，并给出明确中文提示，不会产生半更新数据（整个事务回滚）。

---

## 七、验证命令

```bash
pnpm type-check     # API tsc + 小程序 vue-tsc + Web 构建（含 vue-tsc）
pnpm test           # 后端单元测试（金额 Decimal 计算）
pnpm build:api
pnpm build:admin
pnpm build:mp
```

已实际执行的验证：

- API 类型检查、构建通过；`/api/health`、`/api/health/db` 正常
- 单元测试 7 项通过（Decimal 金额精度）
- 端到端 HTTP 冒烟：建公司 → 车间 → 模板 → 款式 → 捆号 → 员工加入 → 报工 → 重复报工拦截 → 批量报工 → 批量审核 → 工资 235.00 精确 → 完成 → 结算 → 自动 settled → 改价触发数据库限制 → 已结算报工不可删 → 日志/工作台/越权检查
- 争议流程：驳回→重报→争议→转给质疑员工→归属变更
- Excel 导入：预览、确认导入、指定捆号、重复冲突提示
- Web 构建通过；Vite 开发服务器可访问；CORS 预检通过
- 小程序 `build:mp-weixin` 编译成功，`vue-tsc` 类型检查通过

---

## 八、已知限制与待确认

1. **迁移未执行**：见第六节，三项工资相关能力受限。
2. `settlements.total_amount` 精度仍为 2 位（迁移后为 3 位）。当前工资展示金额以实时计算为准。
3. 结算人工修正通过 `operation_logs` 的 `settlement.adjust` 记录（before/after/delta）作为可审计机制；自动重算保留该 delta，不会静默覆盖。若后续希望独立调整明细表，可在此机制上扩展。
4. 小程序管理员端未包含「新建款式/捆号 Excel 导入/工价修改」等重管理操作，按需求由 Web 后台承担；小程序保留审核、争议、代报、工资与结算。
5. 员工发起争议的入口在报工页：点击已被他人报工的捆号即可发起，避免员工浏览全公司报工数据。
6. 金额舍入：明细金额 = 数量 × 单价（三位小数，数据库检查约束要求精确等于）；总额为明细之和。未额外引入四舍五入规则。
7. 微信登录需要真实 AppID/AppSecret；本地开发请使用 `ENABLE_DEV_LOGIN`。

---

## 九、冒烟测试数据

端到端验证在开发库中创建了少量测试数据（公司名含「冒烟测试」「争议测试」）。如需清理，请先确认后按公司维度删除；**不要**直接清空业务表。生产环境请勿执行冒烟脚本。
