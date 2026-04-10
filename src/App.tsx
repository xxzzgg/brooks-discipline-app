import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";

type ContextRoot = "" | "Trend" | "TR";
type TrendBranch = "" | "Breakout" | "Channel";
type BreakoutStrength = "" | "Strong" | "Weak";
type Width = "" | "Tight" | "Broad";
type AlwaysIn = "" | "Long" | "Short" | "Neutral";
type MarketState = "" | "strong-trend" | "weak-trend" | "trading-range";
type Direction = "" | "long" | "short";
type Entry = "" | "stop" | "close" | "limit" | "wait";
type TradeStyle = "" | "swing" | "scalp";
type VerdictLevel = "blocked" | "wait" | "ready";
type View = "decision" | "journal";

type Setup =
  | ""
  | "H1"
  | "H2"
  | "H3"
  | "L1"
  | "L2"
  | "L3"
  | "BO-PB-Long"
  | "BO-PB-Short"
  | "Strong-Trend-Stop-Long"
  | "Strong-Trend-Stop-Short"
  | "Breakout"
  | "Failed-Breakout"
  | "MTR"
  | "Range-Buy-Low"
  | "Range-Sell-High";

type QuickGateKey =
  | "backgroundClear"
  | "locationGood"
  | "supportReason"
  | "signalBarQuality"
  | "priorBarLogic"
  | "riskReward"
  | "stopEntryConfirm";

type DecisionState = {
  instrument: string;
  marketState: MarketState;
  contextRoot: ContextRoot;
  trendBranch: TrendBranch;
  breakoutStrength: BreakoutStrength;
  channelWidth: Width;
  trWidth: Width;
  emaDirection: "" | "up" | "down" | "flat";
  emaSide: "" | "above" | "below" | "mixed";
  alwaysIn: AlwaysIn;
  side: "" | "bulls" | "bears" | "balanced";
  direction: Direction;
  setup: Setup;
  entry: Entry;
  style: TradeStyle;
  stop: string;
  target: string;
  invalidation: string;
  notes: string;
  checks: Record<string, boolean>;
  quickGate: Record<QuickGateKey, boolean | null>;
};

type JournalEntry = DecisionState & {
  id: string;
  savedAt: string;
  verdict: VerdictLevel;
  headline: string;
};

type SetupDefinition = {
  value: Setup;
  title: string;
  family: string;
  direction: Direction | "both";
  fit: string;
  avoid: string;
};

const STORAGE_KEY = "brooks-price-action-tree-v2";

const FINAL_CHECKS = [
  ["stopBeyondInvalidation", "止损在逻辑失效点外"],
  ["minimumTarget", "最小目标足够"],
  ["tradeTypeClear", "Swing / Scalp 已定义"],
  ["exitCondition", "不顺时退出条件清楚"],
] as const;

const QUICK_GATES: Array<{
  key: QuickGateKey;
  title: string;
  detail: string;
}> = [
  {
    key: "backgroundClear",
    title: "背景清晰",
    detail: "不是震荡区间中间位置，Context 和 Always In 看得清。",
  },
  {
    key: "locationGood",
    title: "位置合理",
    detail: "不是在区间中间追单，而是在支撑 / 阻力 / EMA / 边缘附近。",
  },
  {
    key: "supportReason",
    title: "至少一个以上理由",
    detail: "前高低点、EMA、趋势线、通道线、整数关口至少命中一项。",
  },
  {
    key: "signalBarQuality",
    title: "Signal Bar 质量够好",
    detail: "实体足够大，收盘靠近高/低点，没有明显反向尾巴。",
  },
  {
    key: "priorBarLogic",
    title: "前序 K 线支持",
    detail: "顺势看完整回调，反转看 2-3 根衰竭或失败结构。",
  },
  {
    key: "riskReward",
    title: "风险回报可做",
    detail: "止损明确，最小目标至少 1R，理想 1:2 以上。",
  },
  {
    key: "stopEntryConfirm",
    title: "触发等确认",
    detail: "优先 Stop Entry，让下一根突破 signal bar 高/低点来确认。",
  },
];

const SETUPS: SetupDefinition[] = [
  {
    value: "H2",
    title: "H2",
    family: "Trend Pullback",
    direction: "long",
    fit: "上升趋势中，回踩均线时在高 2 买入。",
    avoid: "背景不清、回调太深、信号 K 太差时不做。",
  },
  {
    value: "L2",
    title: "L2",
    family: "Trend Pullback",
    direction: "short",
    fit: "下跌趋势中，回踩均线时在低 2 卖出。",
    avoid: "震荡中间、没有 Always In 空头支持时不做。",
  },
  {
    value: "H3",
    title: "H3",
    family: "Wedge Pullback",
    direction: "long",
    fit: "上升趋势中，在楔形牛旗回调中买入。",
    avoid: "楔形已经演变成宽通道或区间时不做。",
  },
  {
    value: "L3",
    title: "L3",
    family: "Wedge Pullback",
    direction: "short",
    fit: "下跌趋势中，在楔形熊旗回调中卖出。",
    avoid: "如果只是混乱震荡，不把它当 L3。",
  },
  {
    value: "BO-PB-Long",
    title: "BO enter PB Long",
    family: "Breakout Pullback",
    direction: "long",
    fit: "上升趋势中，突破牛旗后在突破回踩时买入。",
    avoid: "强突破已走太远，或回踩已经失去结构时不追。",
  },
  {
    value: "BO-PB-Short",
    title: "BO enter PB Short",
    family: "Breakout Pullback",
    direction: "short",
    fit: "下跌趋势中，突破熊旗后在突破回踩时卖出。",
    avoid: "下沿 overshoot 后别机械追空。",
  },
  {
    value: "H1",
    title: "H1",
    family: "Spike Pullback",
    direction: "long",
    fit: "急速飙升但并非买入高潮后的高 1 回撤买入。",
    avoid: "如果已经是买入高潮，不再把它当 H1。",
  },
  {
    value: "L1",
    title: "L1",
    family: "Spike Pullback",
    direction: "short",
    fit: "急速下跌但并非卖出高潮后的低 1 回撤卖出。",
    avoid: "卖出高潮里做 L1 容易卖在尽头。",
  },
  {
    value: "Strong-Trend-Stop-Long",
    title: "Strong Trend Stop Entry Long",
    family: "Continuation",
    direction: "long",
    fit: "当上升趋势非常强劲时，在前期摆动高点上方挂止损单买入。",
    avoid: "趋势不够强时，不要假装它是强趋势 stop entry。",
  },
  {
    value: "Strong-Trend-Stop-Short",
    title: "Strong Trend Stop Entry Short",
    family: "Continuation",
    direction: "short",
    fit: "当下跌趋势非常强劲时，在前期摆动低点下方挂止损单卖出。",
    avoid: "如果已经 broadening，不再适合这种入场。",
  },
  {
    value: "Breakout",
    title: "Breakout",
    family: "Generic",
    direction: "both",
    fit: "强 breakout + 强 follow-through，优先按 continuation 做。",
    avoid: "range 中部或 breakout 不强时不追。",
  },
  {
    value: "Failed-Breakout",
    title: "Failed Breakout",
    family: "Generic",
    direction: "both",
    fit: "边界突破失败后先做回归，再看能否升级为 reversal。",
    avoid: "只是一次 overshoot，不要太快定义 failure。",
  },
  {
    value: "MTR",
    title: "MTR",
    family: "Generic",
    direction: "both",
    fit: "趋势足够远，配合 wedge / double top-bottom / failed breakout 和 follow-through。",
    avoid: "只有一根 reversal bar 不够。",
  },
  {
    value: "Range-Buy-Low",
    title: "Buy Low in Range",
    family: "Range",
    direction: "long",
    fit: "区间下沿 + bull reversal / failed breakout down 时买入。",
    avoid: "区间中部不做。",
  },
  {
    value: "Range-Sell-High",
    title: "Sell High in Range",
    family: "Range",
    direction: "short",
    fit: "区间上沿 + bear reversal / failed breakout up 时卖出。",
    avoid: "区间中部不做。",
  },
];

const INITIAL_STATE: DecisionState = {
  instrument: "ES",
  marketState: "",
  contextRoot: "",
  trendBranch: "",
  breakoutStrength: "",
  channelWidth: "",
  trWidth: "",
  emaDirection: "",
  emaSide: "",
  alwaysIn: "",
  side: "",
  direction: "",
  setup: "",
  entry: "",
  style: "",
  stop: "",
  target: "",
  invalidation: "",
  notes: "",
  checks: {
    stopBeyondInvalidation: false,
    minimumTarget: false,
    tradeTypeClear: false,
    exitCondition: false,
  },
  quickGate: {
    backgroundClear: null,
    locationGood: null,
    supportReason: null,
    signalBarQuality: null,
    priorBarLogic: null,
    riskReward: null,
    stopEntryConfirm: null,
  },
};

function loadJournal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as JournalEntry[]) : [];
  } catch {
    return [];
  }
}

function contextSummary(state: DecisionState) {
  if (state.contextRoot === "Trend") {
    if (state.trendBranch === "Breakout") {
      return state.breakoutStrength
        ? `Trend / Breakout / ${state.breakoutStrength}`
        : "Trend / Breakout";
    }
    if (state.trendBranch === "Channel") {
      return state.channelWidth ? `Trend / Channel / ${state.channelWidth}` : "Trend / Channel";
    }
    return "Trend";
  }

  if (state.contextRoot === "TR") {
    return state.trWidth ? `TR / ${state.trWidth}` : "TR";
  }

  return "未定义";
}

function playbook(state: DecisionState) {
  if (state.contextRoot === "Trend" && state.trendBranch === "Breakout") {
    if (state.breakoutStrength === "Strong") return "BTC / STC：强突破优先 continuation。";
    if (state.breakoutStrength === "Weak") return "Enter on PB：弱突破更适合等突破回踩。";
  }

  if (state.contextRoot === "Trend" && state.trendBranch === "Channel") {
    if (state.channelWidth === "Tight") return "Trade in Dir of BO：紧通道优先顺势。";
    if (state.channelWidth === "Broad") return "BLSHS Sloped：宽通道更看位置。";
  }

  if (state.contextRoot === "TR") {
    if (state.trWidth === "Tight") return "W4BO：紧区间先等更多信息。";
    if (state.trWidth === "Broad") return "BLSHS：区间边缘价值最高。";
  }

  return "先把 Context 树定清楚，再决定 setup。";
}

function suggestedSetups(state: DecisionState) {
  if (state.contextRoot === "Trend" && state.trendBranch === "Breakout") {
    if (state.breakoutStrength === "Strong") {
      return ["Breakout", "BO-PB-Long", "BO-PB-Short", "Strong-Trend-Stop-Long", "Strong-Trend-Stop-Short"];
    }
    if (state.breakoutStrength === "Weak") {
      return ["BO-PB-Long", "BO-PB-Short", "H2", "L2", "Failed-Breakout"];
    }
  }

  if (state.contextRoot === "Trend" && state.trendBranch === "Channel") {
    if (state.channelWidth === "Tight") {
      return ["H2", "L2", "H3", "L3", "Strong-Trend-Stop-Long", "Strong-Trend-Stop-Short"];
    }
    if (state.channelWidth === "Broad") {
      return ["BO-PB-Long", "BO-PB-Short", "Failed-Breakout", "MTR"];
    }
  }

  if (state.contextRoot === "TR") {
    return ["Range-Buy-Low", "Range-Sell-High", "Failed-Breakout", "Breakout"];
  }

  return [];
}

function suggestedEntries(state: DecisionState) {
  if (state.setup === "H1" || state.setup === "H2" || state.setup === "H3") return ["stop", "wait"];
  if (state.setup === "L1" || state.setup === "L2" || state.setup === "L3") return ["stop", "wait"];
  if (state.setup === "BO-PB-Long" || state.setup === "BO-PB-Short") return ["stop", "wait"];
  if (state.setup === "Strong-Trend-Stop-Long" || state.setup === "Strong-Trend-Stop-Short") return ["stop"];
  if (state.setup === "Breakout") return ["close", "stop", "wait"];
  if (state.setup === "Failed-Breakout" || state.setup === "MTR") return ["stop", "wait", "limit"];
  if (state.setup === "Range-Buy-Low" || state.setup === "Range-Sell-High") return ["limit", "stop", "wait"];
  return [];
}

function setupMeta(setup: Setup) {
  return SETUPS.find((item) => item.value === setup);
}

function entryMeta(entry: Entry) {
  return {
    stop: "Stop Entry",
    close: "Enter on Close",
    limit: "Limit Entry",
    wait: "Wait for Pullback / Second Entry",
    "": "未定义",
  }[entry];
}

function evaluate(state: DecisionState) {
  const blockers: string[] = [];
  const cautions: string[] = [];
  const passes: string[] = [];

  if (!state.marketState) blockers.push("还没有判断市场是强趋势、弱趋势还是震荡区间。");
  else passes.push(`市场状态：${state.marketState}`);

  if (!state.contextRoot) blockers.push("Context 根节点未定义。");
  else passes.push(`Context：${contextSummary(state)}`);

  if (!state.alwaysIn) blockers.push("Always In 方向未定义。");
  else passes.push(`Always In：${state.alwaysIn}`);

  const quickValues = Object.values(state.quickGate);
  const missingQuick = quickValues.filter((value) => value === null).length;
  const failedQuick = QUICK_GATES.filter((item) => state.quickGate[item.key] === false);

  if (missingQuick > 0) {
    blockers.push(`二元快速筛选还有 ${missingQuick} 项未回答。`);
  }
  if (failedQuick.length > 0) {
    blockers.push(`二元筛选未通过：${failedQuick.map((item) => item.title).join("、")}。`);
  } else if (quickValues.every((value) => value === true)) {
    passes.push("二元快速筛选全部通过。");
  }

  if (!state.setup) blockers.push("还没有选择 setup。");
  else passes.push(`Setup：${setupMeta(state.setup)?.title}`);

  if (!state.entry) blockers.push("还没有选择 entry。");
  else passes.push(`Entry：${entryMeta(state.entry)}`);

  if (!state.direction) blockers.push("Long / Short 未定义。");
  if (!state.stop.trim()) blockers.push("止损未写。");
  if (!state.target.trim()) cautions.push("最小目标未写清。");
  if (!state.invalidation.trim()) blockers.push("认错条件未写。");
  if (!state.style) cautions.push("Swing / Scalp 未定义。");

  const finalCheckCount = Object.values(state.checks).filter(Boolean).length;
  if (finalCheckCount < 3) blockers.push("最终核对不足 3 项。");
  else passes.push(`最终核对 ${finalCheckCount}/4 通过`);

  const allowedSetups = suggestedSetups(state);
  const allowedEntries = suggestedEntries(state);

  if (state.setup && allowedSetups.length > 0 && !allowedSetups.includes(state.setup)) {
    cautions.push("当前 setup 不是这个 Context 下的优先候选。");
  }

  if (state.entry && allowedEntries.length > 0 && !allowedEntries.includes(state.entry)) {
    cautions.push("当前 entry 与这个 setup 不够匹配。");
  }

  const setup = setupMeta(state.setup);
  if (setup?.direction === "long" && state.direction === "short") {
    blockers.push("setup 是做多结构，但方向选成了 short。");
  }
  if (setup?.direction === "short" && state.direction === "long") {
    blockers.push("setup 是做空结构，但方向选成了 long。");
  }

  if (
    state.direction === "long" &&
    state.alwaysIn === "Short" &&
    state.contextRoot === "Trend"
  ) {
    cautions.push("Always In 仍然偏空，逆势做多要更强理由。");
  }

  if (
    state.direction === "short" &&
    state.alwaysIn === "Long" &&
    state.contextRoot === "Trend"
  ) {
    cautions.push("Always In 仍然偏多，逆势做空要更强理由。");
  }

  if (
    state.contextRoot === "TR" &&
    (state.setup === "Strong-Trend-Stop-Long" || state.setup === "Strong-Trend-Stop-Short")
  ) {
    blockers.push("TR 背景下不能用强趋势 stop entry 逻辑。");
  }

  if (state.entry === "close" && state.quickGate.stopEntryConfirm !== true) {
    cautions.push("当前没有走 Stop Entry 确认，只有最强 breakout 才适合直接 close 进。");
  }

  const verdict: VerdictLevel = blockers.length ? "blocked" : cautions.length ? "wait" : "ready";
  const headline =
    verdict === "ready"
      ? "可以执行：背景、setup 质量和 entry 已经一致。"
      : verdict === "wait"
        ? "继续观察：有结构，但还没有强到能机械下单。"
        : "禁止下单：Context 或 setup 质量还没过闸门。";

  return { verdict, headline, blockers, cautions, passes };
}

function App() {
  const [view, setView] = useState<View>("decision");
  const [state, setState] = useState<DecisionState>(INITIAL_STATE);
  const [journal, setJournal] = useState<JournalEntry[]>(loadJournal);

  const result = evaluate(state);
  const allowedSetups = suggestedSetups(state);
  const allowedEntries = suggestedEntries(state);

  const summary = useMemo(() => {
    const total = journal.length;
    const ready = journal.filter((entry) => entry.verdict === "ready").length;
    const blocked = journal.filter((entry) => entry.verdict === "blocked").length;
    return { total, ready, blocked };
  }, [journal]);

  function update<K extends keyof DecisionState>(key: K, value: DecisionState[K]) {
    setState((current) => ({ ...current, [key]: value }));
  }

  function toggleFinalCheck(key: keyof DecisionState["checks"]) {
    setState((current) => ({
      ...current,
      checks: { ...current.checks, [key]: !current.checks[key] },
    }));
  }

  function setQuickGate(key: QuickGateKey, value: boolean) {
    setState((current) => ({
      ...current,
      quickGate: { ...current.quickGate, [key]: value },
    }));
  }

  function saveDecision() {
    const entry: JournalEntry = {
      ...state,
      id: crypto.randomUUID(),
      savedAt: new Date().toLocaleString("zh-CN"),
      verdict: result.verdict,
      headline: result.headline,
    };
    const next = [entry, ...journal].slice(0, 200);
    setJournal(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setView("journal");
  }

  function clearDraft() {
    setState(INITIAL_STATE);
  }

  function deleteEntry(id: string) {
    const next = journal.filter((entry) => entry.id !== id);
    setJournal(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <Badge variant="outline">Brooks Price Action</Badge>
          <h1>盘中快速决策树</h1>
          <p>先定大背景，再用二元筛选过滤 setup 质量，最后才决定 entry。</p>
        </div>
        <div className="header-actions">
          <Button variant={view === "decision" ? "default" : "outline"} onClick={() => setView("decision")}>
            快速决策
          </Button>
          <Button variant={view === "journal" ? "default" : "outline"} onClick={() => setView("journal")}>
            决策日志
          </Button>
        </div>
      </header>

      {view === "decision" ? (
        <div className="decision-layout">
          <section className="main-flow">
            <Card>
              <CardHeader>
                <CardTitle>0. 二元快速筛选</CardTitle>
                <CardDescription>任何一项是 No，这笔单通常先不做。</CardDescription>
              </CardHeader>
              <CardContent className="gate-grid">
                {QUICK_GATES.map((item) => (
                  <div key={item.key} className="gate-card">
                    <div className="gate-copy">
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                    </div>
                    <div className="gate-actions">
                      <Button
                        size="sm"
                        variant={state.quickGate[item.key] === true ? "default" : "outline"}
                        onClick={() => setQuickGate(item.key, true)}
                      >
                        Yes
                      </Button>
                      <Button
                        size="sm"
                        variant={state.quickGate[item.key] === false ? "destructive" : "outline"}
                        onClick={() => setQuickGate(item.key, false)}
                      >
                        No
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>1. 第一层：大背景 Context</CardTitle>
                <CardDescription>先回答：强趋势、弱趋势，还是震荡区间。</CardDescription>
              </CardHeader>
              <CardContent className="trade-form">
                <Label>
                  <span>Market State</span>
                  <Select value={state.marketState} onChange={(event) => update("marketState", event.target.value as MarketState)}>
                    <option value="">请选择</option>
                    <option value="strong-trend">Strong Trend</option>
                    <option value="weak-trend">Weak Trend</option>
                    <option value="trading-range">Trading Range</option>
                  </Select>
                </Label>
                <Label>
                  <span>EMA Direction</span>
                  <Select value={state.emaDirection} onChange={(event) => update("emaDirection", event.target.value as DecisionState["emaDirection"])}>
                    <option value="">请选择</option>
                    <option value="up">Up</option>
                    <option value="down">Down</option>
                    <option value="flat">Flat</option>
                  </Select>
                </Label>
                <Label>
                  <span>Price vs EMA</span>
                  <Select value={state.emaSide} onChange={(event) => update("emaSide", event.target.value as DecisionState["emaSide"])}>
                    <option value="">请选择</option>
                    <option value="above">Above EMA</option>
                    <option value="below">Below EMA</option>
                    <option value="mixed">Mixed / Crossing</option>
                  </Select>
                </Label>
                <Label>
                  <span>Always In</span>
                  <Select value={state.alwaysIn} onChange={(event) => update("alwaysIn", event.target.value as AlwaysIn)}>
                    <option value="">请选择</option>
                    <option value="Long">Always In Long</option>
                    <option value="Short">Always In Short</option>
                    <option value="Neutral">Neutral</option>
                  </Select>
                </Label>
              </CardContent>
              <CardContent className="context-tree-grid">
                <div className="tree-column">
                  <span className="tree-label">Context</span>
                  <div className="segmented">
                    {["Trend", "TR"].map((value) => (
                      <Button
                        key={value}
                        variant={state.contextRoot === value ? "default" : "outline"}
                        onClick={() =>
                          setState((current) => ({
                            ...current,
                            contextRoot: value as ContextRoot,
                            trendBranch: "",
                            breakoutStrength: "",
                            channelWidth: "",
                            trWidth: "",
                          }))
                        }
                      >
                        {value}
                      </Button>
                    ))}
                  </div>
                </div>

                {state.contextRoot === "Trend" ? (
                  <>
                    <div className="tree-column">
                      <span className="tree-label">Trend Branch</span>
                      <div className="segmented">
                        {["Breakout", "Channel"].map((value) => (
                          <Button
                            key={value}
                            variant={state.trendBranch === value ? "default" : "outline"}
                            onClick={() => update("trendBranch", value as TrendBranch)}
                          >
                            {value}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {state.trendBranch === "Breakout" ? (
                      <div className="tree-column">
                        <span className="tree-label">Breakout</span>
                        <div className="segmented">
                          {["Strong", "Weak"].map((value) => (
                            <Button
                              key={value}
                              variant={state.breakoutStrength === value ? "default" : "outline"}
                              onClick={() => update("breakoutStrength", value as BreakoutStrength)}
                            >
                              {value}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {state.trendBranch === "Channel" ? (
                      <div className="tree-column">
                        <span className="tree-label">Channel</span>
                        <div className="segmented">
                          {["Tight", "Broad"].map((value) => (
                            <Button
                              key={value}
                              variant={state.channelWidth === value ? "default" : "outline"}
                              onClick={() => update("channelWidth", value as Width)}
                            >
                              {value}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}

                {state.contextRoot === "TR" ? (
                  <div className="tree-column">
                    <span className="tree-label">TR Width</span>
                    <div className="segmented">
                      {["Tight", "Broad"].map((value) => (
                        <Button
                          key={value}
                          variant={state.trWidth === value ? "default" : "outline"}
                          onClick={() => update("trWidth", value as Width)}
                        >
                          {value}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="context-playbook-box">
                  <Badge variant="secondary">{contextSummary(state)}</Badge>
                  <p>{playbook(state)}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>2. 哪一方更强</CardTitle>
                <CardDescription>方向要与背景和 Always In 一致。</CardDescription>
              </CardHeader>
              <CardContent className="segmented">
                {[
                  ["bulls", "Bulls stronger"],
                  ["bears", "Bears stronger"],
                  ["balanced", "双方都不够强"],
                ].map(([value, label]) => (
                  <Button
                    key={value}
                    variant={state.side === value ? "default" : "outline"}
                    onClick={() => update("side", value as DecisionState["side"])}
                  >
                    {label}
                  </Button>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>3. Setup 库</CardTitle>
                <CardDescription>高亮项是当前 Context 下优先看的 setup。</CardDescription>
              </CardHeader>
              <CardContent className="option-grid setup-library-grid">
                {SETUPS.map((item) => (
                  <button
                    key={item.value}
                    className={cn(
                      "option-card",
                      state.setup === item.value && "is-selected",
                      allowedSetups.includes(item.value) && "is-recommended",
                    )}
                    onClick={() => update("setup", item.value)}
                  >
                    <strong>{item.title}</strong>
                    <span>{item.fit}</span>
                    <em>{item.family}</em>
                  </button>
                ))}
              </CardContent>
              {state.setup ? (
                <CardContent>
                  <div className="callout">
                    <strong>回避条件</strong>
                    <p>{setupMeta(state.setup)?.avoid}</p>
                  </div>
                </CardContent>
              ) : null}
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>4. Entry</CardTitle>
                <CardDescription>Brooks 默认优先 Stop Entry，其他方式必须有足够理由。</CardDescription>
              </CardHeader>
              <CardContent className="option-grid entry-grid">
                {[
                  ["stop", "Stop Entry", "下一根超过 signal bar 高/低点 1 tick 再触发。"],
                  ["close", "Enter on Close", "只给最强 breakout / FOMO trend。"],
                  ["limit", "Limit Entry", "更适合 broad channel / range 边缘。"],
                  ["wait", "Wait", "等回踩、second entry 或 confirm bar。"],
                ].map(([value, title, detail]) => (
                  <button
                    key={value}
                    className={cn(
                      "option-card",
                      state.entry === value && "is-selected",
                      allowedEntries.includes(value as Entry) && "is-recommended",
                    )}
                    onClick={() => update("entry", value as Entry)}
                  >
                    <strong>{title}</strong>
                    <span>{detail}</span>
                  </button>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>5. 最终核对</CardTitle>
                <CardDescription>如果这一步答不清，setup 再漂亮也先不做。</CardDescription>
              </CardHeader>
              <CardContent className="trade-form">
                <Label>
                  <span>Instrument</span>
                  <Input value={state.instrument} onChange={(event) => update("instrument", event.target.value)} />
                </Label>
                <Label>
                  <span>Direction</span>
                  <Select value={state.direction} onChange={(event) => update("direction", event.target.value as Direction)}>
                    <option value="">请选择</option>
                    <option value="long">Long</option>
                    <option value="short">Short</option>
                  </Select>
                </Label>
                <Label>
                  <span>Stop</span>
                  <Input value={state.stop} onChange={(event) => update("stop", event.target.value)} placeholder="signal bar 另一端 + 1-2 tick" />
                </Label>
                <Label>
                  <span>Minimum Target</span>
                  <Input value={state.target} onChange={(event) => update("target", event.target.value)} placeholder="至少 1R，理想 2R" />
                </Label>
                <Label>
                  <span>Trade Type</span>
                  <Select value={state.style} onChange={(event) => update("style", event.target.value as TradeStyle)}>
                    <option value="">请选择</option>
                    <option value="swing">Swing</option>
                    <option value="scalp">Scalp</option>
                  </Select>
                </Label>
                <Label className="wide-field">
                  <span>认错条件</span>
                  <Textarea rows={3} value={state.invalidation} onChange={(event) => update("invalidation", event.target.value)} />
                </Label>
                <Label className="wide-field">
                  <span>Notes</span>
                  <Textarea rows={3} value={state.notes} onChange={(event) => update("notes", event.target.value)} placeholder="支撑/阻力、signal bar、前序逻辑、Always In 理由。" />
                </Label>
              </CardContent>
              <CardContent className="check-grid">
                {FINAL_CHECKS.map(([key, label]) => (
                  <button
                    key={key}
                    className={cn("check-item", state.checks[key] && "is-selected")}
                    onClick={() => toggleFinalCheck(key)}
                  >
                    {label}
                  </button>
                ))}
              </CardContent>
            </Card>
          </section>

          <aside className="verdict-panel">
            <Card className={cn("verdict-card", `verdict-${result.verdict}`)}>
              <CardHeader>
                <Badge variant={result.verdict === "ready" ? "default" : result.verdict === "wait" ? "secondary" : "destructive"}>
                  {result.verdict.toUpperCase()}
                </Badge>
                <CardTitle>{result.headline}</CardTitle>
                <CardDescription>背景支持的方向上，setup 才有意义。</CardDescription>
              </CardHeader>
              <CardContent className="verdict-content">
                <section>
                  <h3>阻止项</h3>
                  {(result.blockers.length ? result.blockers : ["无关键阻止项。"]).map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </section>
                <section>
                  <h3>警告</h3>
                  {(result.cautions.length ? result.cautions : ["暂无警告。"]).map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </section>
                <section>
                  <h3>通过项</h3>
                  {(result.passes.length ? result.passes : ["等待更多信息。"]).map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </section>
              </CardContent>
              <CardContent className="action-row">
                <Button onClick={saveDecision}>保存决策</Button>
                <Button variant="outline" onClick={clearDraft}>清空草稿</Button>
              </CardContent>
            </Card>
          </aside>
        </div>
      ) : (
        <section className="journal-view">
          <Card>
            <CardHeader>
              <CardTitle>决策日志</CardTitle>
              <CardDescription>
                共 {summary.total} 条，READY {summary.ready}，BLOCKED {summary.blocked}。
              </CardDescription>
            </CardHeader>
          </Card>

          <div className="journal-grid">
            {journal.length === 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>暂无记录</CardTitle>
                  <CardDescription>保存一次快速决策后会出现在这里。</CardDescription>
                </CardHeader>
              </Card>
            ) : (
              journal.map((entry) => (
                <Card key={entry.id}>
                  <CardHeader>
                    <div className="journal-heading">
                      <Badge variant={entry.verdict === "ready" ? "default" : entry.verdict === "wait" ? "secondary" : "destructive"}>
                        {entry.verdict}
                      </Badge>
                      <span>{entry.savedAt}</span>
                    </div>
                    <CardTitle>{entry.headline}</CardTitle>
                    <CardDescription>
                      {entry.instrument} / {entry.direction || "no direction"} / {contextSummary(entry)} / {setupMeta(entry.setup)?.title || "no setup"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="journal-detail">
                    <p>{entry.notes || "无 notes"}</p>
                    <div className="pill-line">
                      <Badge variant="outline">{entryMeta(entry.entry)}</Badge>
                      <Badge variant="outline">Always In {entry.alwaysIn || "none"}</Badge>
                      <Badge variant="outline">Stop {entry.stop || "none"}</Badge>
                      <Badge variant="outline">Target {entry.target || "none"}</Badge>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => deleteEntry(entry.id)}>
                      删除
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </section>
      )}
    </main>
  );
}

export default App;
