# Brooks Discipline App

一个基于 `React + Vite` 的 Brooks Price Action 纪律工具。

## 设计目标

这个应用不负责自动识别市场，也不负责自动下单。

它负责：

1. 强制你先定义 `Open / Day / Context`
2. 把 `Entry Setup` 和 `Guardrails` 分开
3. 在不满足条件时直接 `BLOCKED`
4. 在持仓期间每 `5` 分钟弹出复查提醒：
   - `premise` 是否仍成立
   - `context` 是否改变
   - `stop` 是否还在
   - 是否开始想 `scale into loser`
   - 复查对齐到整数 `5` 分钟 K 线时间，而不是从启动时刻往后推 `5` 分钟
     - 例如 `11:44` 启动，则 `11:45` 立即弹窗
     - 如果在 `11:45` 整启动，则下一次是 `11:50`
5. 把记录保存到本地 `JSON` 文件，并在页面里直接分类预览：
   - `Context`
   - `Open`
   - `Day`
   - `Setup`
   - `Error`

## 关键建模

### 1. Context Tree

- `Trend`
  - `Breakout`
    - `Strong`
    - `Weak`
  - `Channel`
    - `Tight`
    - `Broad`
- `TR`
  - `Tight`
  - `Broad`

系统会基于这个树自动给出 playbook 提示：

- `Strong Breakout` -> `BTC / STC`
- `Weak Breakout` -> `Enter on PB`
- `Tight Channel` -> `Trade in Direction of BO`
- `Broad Channel` -> `BLSHS Sloped`
- `Tight TR` -> `W4BO`
- `Broad TR` -> `BLSHS`

### 2. Setup 和 Guardrails 分离

你提出的修正已经体现在这版里：

- `Second Entry`
- `Follow-Through`

不再作为独立 setup，而是合并为：

- `Wait for Confirmation`

也就是：

- 没有等到更多确认，就不能进场

`Measured Move` 也不再作为 setup，而是一个独立的保护闸门：

- `Measured Move Checked`

目的就是防止：

- 盲目抄底摸顶
- 没有测量空间就贸然追单

### 3. Entry Setup

当前支持：

- `H1`
- `H2`
- `H3`
- `L1`
- `L2`
- `L3`
- `BO Enter PB`
- `Strong Trend Stop Entry`

## 运行

安装依赖：

```bash
npm install
```

启动开发环境：

```bash
npm run dev
```

默认端口：

- `4174`

## 本地文件保存

这版支持两种保存方式：

### 1. 直接绑定本地文件

如果浏览器支持 `File System Access API`：

- 点击 `绑定日志文件`
- 选择或创建一个 `json` 文件
- 之后每次保存决策或复查记录，页面会自动回写这个文件

### 2. 下载 / 导入 JSON

如果浏览器不支持直接写文件：

- 点击 `保存到本地文件` 下载 JSON
- 点击 `导入日志文件` 重新载入之前的记录

日志文件内容包括：

- `draft`
- `decisions`
- `reminders`
- `decisions[*].finalPnl`
- `decisions[*].tradeNotes`

当前文件格式版本为：

- `version: 2`

导入时会自动兼容缺少 `finalPnl` / `tradeNotes` 的旧记录，并补默认值。

## 页面分类预览

应用内增加了 `Classification Dashboard`，会按以下维度聚合：

- `Decision`
- `Context`
- `Open`
- `Day`
- `Setup`
- `Errors`

并支持：

- 手动筛选 `Decision / Context / Open / Day / Setup / Error`
- 直接在页面里编辑单条记录的 `final P&L`
- 直接补充 `trade notes`
- 删除记录
- 统计筛选结果下的：
  - `Total P&L`
  - `Avg P&L`
  - `Wins / Losses / Open`

## 当前主要规则

### 直接阻止

- 缺少 `Open / Day / Context`
- 缺少方向
- 缺少 `entry setup`
- 没有等待确认
- 没有止损
- 没有 `premise`
- 没有 `premise invalidation`
- 仓位超过最大计划
- `Revenge trading`
- `Scaling into a losing position`
- `Enter without a clear criterion`

### 警告

- 没做 `Measured Move`
- 强趋势里逆势
- `TR` 环境却用趋势延续 setup
- 当日交易次数过多
- `Trade against the trend`
- `Exit too early because of fear`

## 下一步建议

下一版最值得加的东西：

1. `Preset setup templates`
   - `Trend Pullback`
   - `Opening Reversal`
   - `TR Fade`

2. `Hard daily risk limits`
   - 单日最大亏损
   - 连续亏损停手
   - 最大交易笔数

3. `Review dashboard`
   - 哪类错误最常出现
   - 哪类 setup 最常导致低质量交易
   - premise 失效后你是否还在持仓
# brooks-discipline-app
