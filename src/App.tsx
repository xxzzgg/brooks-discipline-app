import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type Direction = "" | "long" | "short";
type ContextRoot = "" | "Trend" | "TR";
type TrendBranch = "" | "Breakout" | "Channel";
type BreakoutStrength = "" | "Strong" | "Weak";
type ChannelWidth = "" | "Tight" | "Broad";
type TrWidth = "" | "Tight" | "Broad";

type EntrySetup =
  | ""
  | "H1"
  | "H2"
  | "H3"
  | "L1"
  | "L2"
  | "L3"
  | "BO Enter PB"
  | "Strong Trend Stop Entry";

type ReminderCheck = {
  premiseStillValid: boolean;
  contextChanged: boolean;
  stopStillInPlace: boolean;
  temptedToScaleIn: boolean;
  measuredMoveUpdated: boolean;
};

type FormState = {
  openPattern: string;
  dayPattern: string;
  contextRoot: ContextRoot;
  trendBranch: TrendBranch;
  breakoutStrength: BreakoutStrength;
  channelWidth: ChannelWidth;
  trWidth: TrWidth;
  direction: Direction;
  entrySetup: EntrySetup;
  trendBodyHealthy: boolean;
  trendLowOverlap: boolean;
  trendShallowPullback: boolean;
  trendEmaSteep: boolean;
  needConfirmation: boolean;
  measuredMoveChecked: boolean;
  premise: string;
  premiseInvalidation: string;
  takeProfitPlan: string;
  instrument: string;
  entryPrice: string;
  stopPrice: string;
  plannedRisk: string;
  plannedSize: string;
  maxSize: string;
  tradesToday: string;
  activeTrade: boolean;
  mistakes: string[];
};

type DecisionLevel = "BLOCKED" | "CAUTION" | "ALLOWED";

type HistoryEntry = {
  id: string;
  savedAt: string;
  updatedAt?: string;
  decision: DecisionLevel;
  score: number;
  snapshot: FormState;
  finalPnl: number | null;
  tradeNotes: string;
};

type ReminderLog = {
  id: string;
  timestamp: string;
  check: ReminderCheck;
  notes: string;
};

type Evaluation = {
  decision: DecisionLevel;
  score: number;
  reasons: string[];
  passes: string[];
};

type JournalFile = {
  version: 2;
  exportedAt: string;
  draft: FormState;
  decisions: HistoryEntry[];
  reminders: ReminderLog[];
};

type AnyFileHandle = {
  name?: string;
  createWritable?: () => Promise<{
    write: (data: string) => Promise<void>;
    close: () => Promise<void>;
  }>;
};

type FilterState = {
  decision: string;
  context: string;
  open: string;
  day: string;
  setup: string;
  error: string;
};

type StatItem = {
  label: string;
  count: number;
  totalPnl: number;
};

const HISTORY_KEY = "brooks-discipline-react-history-v2";
const REMINDER_LOG_KEY = "brooks-discipline-react-reminders-v2";
const REMINDER_STATE_KEY = "brooks-discipline-react-form-v2";
const REMINDER_INTERVAL_MS = 5 * 60 * 1000;

const OPEN_PATTERNS = [
  "Gap and Go / Gap Fill",
  "Trend From The Open",
  "Trading Range Open",
  "Opening Reversal",
];

const DAY_PATTERNS = [
  "Major Trend Reversal",
  "Spike and Channel",
  "Trading Range",
];

const ENTRY_SETUPS: Array<{
  value: EntrySetup;
  title: string;
  description: string;
}> = [
  { value: "H2", title: "H2", description: "上升趋势回踩均线，高二买入。" },
  { value: "L2", title: "L2", description: "下跌趋势回踩均线，低二卖出。" },
  { value: "H3", title: "H3", description: "上升趋势中楔形牛旗回调买入。" },
  { value: "L3", title: "L3", description: "下跌趋势中楔形熊旗回调卖出。" },
  {
    value: "BO Enter PB",
    title: "BO enter PB",
    description: "突破后等回踩再进，不追第一脚。",
  },
  {
    value: "H1",
    title: "H1",
    description: "强劲上涨但非买入高潮，急速飙升后的高一回撤买入。",
  },
  {
    value: "L1",
    title: "L1",
    description: "强劲下跌但非卖出高潮，急速下跌后的低一回撤卖出。",
  },
  {
    value: "Strong Trend Stop Entry",
    title: "Strong Trend Stop Entry",
    description: "强趋势中在前期摆动高/低点外用 stop order 顺势进场。",
  },
];

const DISCIPLINE_MISTAKES = [
  "Trade against the trend",
  "Revenge trading",
  "Enter too early and not wait for the signal",
  "Exit too early because of fear",
  "Scaling into a losing position",
  "Trading bigger than my defined size",
  "Do not stop the trade",
  "Overtrading",
  "Enter without a clear criterion",
];

const EMPTY_FILTERS: FilterState = {
  decision: "",
  context: "",
  open: "",
  day: "",
  setup: "",
  error: "",
};

const INITIAL_STATE: FormState = {
  openPattern: "",
  dayPattern: "",
  contextRoot: "",
  trendBranch: "",
  breakoutStrength: "",
  channelWidth: "",
  trWidth: "",
  direction: "",
  entrySetup: "",
  trendBodyHealthy: false,
  trendLowOverlap: false,
  trendShallowPullback: false,
  trendEmaSteep: false,
  needConfirmation: false,
  measuredMoveChecked: false,
  premise: "",
  premiseInvalidation: "",
  takeProfitPlan: "",
  instrument: "ES",
  entryPrice: "",
  stopPrice: "",
  plannedRisk: "",
  plannedSize: "",
  maxSize: "",
  tradesToday: "",
  activeTrade: false,
  mistakes: [],
};

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

function toNumber(value: string) {
  if (value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatContext(snapshot: FormState) {
  if (snapshot.contextRoot === "Trend") {
    const branchDetail =
      snapshot.trendBranch === "Breakout"
        ? snapshot.breakoutStrength
        : snapshot.trendBranch === "Channel"
          ? snapshot.channelWidth
          : "";

    return [snapshot.contextRoot, snapshot.trendBranch, branchDetail]
      .filter(Boolean)
      .join(" / ");
  }

  if (snapshot.contextRoot === "TR") {
    return [snapshot.contextRoot, snapshot.trWidth].filter(Boolean).join(" / ");
  }

  return "Undefined";
}

function nextFiveMinuteBoundary(from: Date) {
  const next = new Date(from);
  next.setSeconds(0, 0);
  const remainder = next.getMinutes() % 5;
  next.setMinutes(next.getMinutes() + (remainder === 0 ? 5 : 5 - remainder));
  return next;
}

function formatReminderTime(date: Date) {
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function derivePlaybook(state: FormState) {
  if (state.contextRoot === "Trend" && state.trendBranch === "Breakout") {
    if (state.breakoutStrength === "Strong") {
      return "BTC / STC：强突破更适合顺势追突破，而不是等深回调。";
    }
    if (state.breakoutStrength === "Weak") {
      return "Enter on PB：弱突破优先等 breakout pullback，而不是直接追。";
    }
  }

  if (state.contextRoot === "Trend" && state.trendBranch === "Channel") {
    if (state.channelWidth === "Tight") {
      return "Trade in Direction of BO：紧通道优先顺突破方向交易。";
    }
    if (state.channelWidth === "Broad") {
      return "BLSHS Sloped：宽通道更像斜率震荡，先找低买高卖高抛。";
    }
  }

  if (state.contextRoot === "TR") {
    if (state.trWidth === "Tight") {
      return "W4BO：紧区间先等更多信息，不要急着抢方向。";
    }
    if (state.trWidth === "Broad") {
      return "BLSHS：宽区间优先边缘交易，不在中间追。";
    }
  }

  return "先定义 Context 分支，系统才会给出推荐 playbook。";
}

function deriveTrendStrength(state: FormState) {
  const checks = [
    state.trendBodyHealthy,
    state.trendLowOverlap,
    state.trendShallowPullback,
    state.trendEmaSteep,
  ];
  const score = checks.filter(Boolean).length;

  if (score === 4) {
    return {
      score,
      label: "Strong Trend",
      summary: "EMA 仍然陡峭，推进段干净，回调浅，几乎没有重叠。",
    };
  }

  if (score === 3) {
    return {
      score,
      label: "Tradable Trend",
      summary: "趋势还在，但已经不是最干净的强趋势，顺势要更挑位置。",
    };
  }

  if (score === 2) {
    return {
      score,
      label: "Weak Trend",
      summary: "趋势质量一般，开始接近 broad channel / TR 的交易条件。",
    };
  }

  return {
    score,
    label: "Poor Trend",
    summary: "趋势证据不足，更像震荡或衰竭段，不适合按强趋势假设交易。",
  };
}

function requiresTrendDirection(entrySetup: EntrySetup) {
  return [
    "H1",
    "H2",
    "H3",
    "L1",
    "L2",
    "L3",
    "BO Enter PB",
    "Strong Trend Stop Entry",
  ].includes(entrySetup);
}

function evaluate(state: FormState): Evaluation {
  const reasons: string[] = [];
  const passes: string[] = [];
  let score = 100;
  let blocked = false;
  let caution = false;
  const trendStrength = deriveTrendStrength(state);

  function pass(message: string) {
    passes.push(message);
  }

  function fail(
    message: string,
    options: { blocked?: boolean; caution?: boolean; penalty?: number } = {},
  ) {
    reasons.push(message);
    score -= options.penalty ?? 10;
    blocked = blocked || !!options.blocked;
    caution = caution || !!options.caution;
  }

  if (state.openPattern) pass(`Open pattern 已定义为 ${state.openPattern}`);
  else fail("缺少 Open pattern。", { blocked: true, penalty: 12 });

  if (state.dayPattern) pass(`Day pattern 已定义为 ${state.dayPattern}`);
  else fail("缺少 Day pattern。", { blocked: true, penalty: 12 });

  if (state.contextRoot) pass(`Context 根节点为 ${state.contextRoot}`);
  else fail("缺少 Context 根节点。", { blocked: true, penalty: 14 });

  if (state.contextRoot === "Trend" && !state.trendBranch) {
    fail("Trend context 下还没有定义是 Breakout 还是 Channel。", {
      blocked: true,
      penalty: 14,
    });
  }

  if (state.trendBranch === "Breakout" && !state.breakoutStrength) {
    fail("Breakout context 下没有定义 Strong / Weak。", {
      blocked: true,
      penalty: 12,
    });
  }

  if (state.trendBranch === "Channel" && !state.channelWidth) {
    fail("Channel context 下没有定义 Tight / Broad。", {
      blocked: true,
      penalty: 12,
    });
  }

  if (state.contextRoot === "TR" && !state.trWidth) {
    fail("TR context 下没有定义 Tight / Broad。", {
      blocked: true,
      penalty: 12,
    });
  }

  if (state.direction) pass(`方向为 ${state.direction.toUpperCase()}`);
  else fail("没有定义方向。", { blocked: true, penalty: 12 });

  if (state.contextRoot === "Trend") {
    if (trendStrength.score >= 3) {
      pass(`Trend strength = ${trendStrength.label}`);
    } else {
      fail(`当前趋势强度偏弱：${trendStrength.summary}`, {
        caution: true,
        penalty: trendStrength.score === 2 ? 8 : 14,
      });
    }
  }

  if (state.entrySetup) pass(`Entry setup 为 ${state.entrySetup}`);
  else fail("没有定义 entry setup。", { blocked: true, penalty: 16 });

  if (state.needConfirmation) pass("已确认这笔交易等待过更明确的信号。");
  else {
    fail("你还没有确认已经等待了 Second Entry / Follow-Through。", {
      blocked: true,
      penalty: 18,
    });
  }

  if (state.measuredMoveChecked) pass("已做 Measured Move 检查。");
  else {
    fail("没有做 Measured Move 检查，存在盲目抄底摸顶风险。", {
      caution: true,
      penalty: 12,
    });
  }

  if (state.stopPrice.trim()) pass("止损价格已定义。");
  else fail("没有设置止损价格。", { blocked: true, penalty: 20 });

  if (state.premise.trim().length >= 16) pass("Premise 已写清楚。");
  else {
    fail("Premise 太空，不能证明为什么要做这笔交易。", {
      blocked: true,
      penalty: 18,
    });
  }

  if (state.premiseInvalidation.trim().length >= 10)
    pass("Premise invalidation 已写明。");
  else {
    fail("没有写清楚 premise invalidation。", {
      blocked: true,
      penalty: 18,
    });
  }

  if (state.takeProfitPlan.trim().length >= 8)
    pass("Take-profit plan 已定义。");
  else fail("没有写清楚 take-profit plan。", { caution: true, penalty: 8 });

  const plannedSize = toNumber(state.plannedSize);
  const maxSize = toNumber(state.maxSize);
  if (plannedSize != null && maxSize != null) {
    if (plannedSize <= maxSize) pass("仓位没有超过计划。");
    else {
      fail("计划仓位超过了你定义的最大仓位。", {
        blocked: true,
        penalty: 20,
      });
    }
  }

  const tradesToday = toNumber(state.tradesToday);
  if (tradesToday != null && tradesToday > 3) {
    fail("今天交易笔数已经偏多，存在 overtrading 风险。", {
      caution: true,
      penalty: 10,
    });
  }

  if (
    state.direction === "long" &&
    state.contextRoot === "Trend" &&
    state.entrySetup.startsWith("L")
  ) {
    fail("当前方向是 Long，但 setup 是 L 系列。", {
      blocked: true,
      penalty: 18,
    });
  }

  if (
    state.direction === "short" &&
    state.contextRoot === "Trend" &&
    state.entrySetup.startsWith("H")
  ) {
    fail("当前方向是 Short，但 setup 是 H 系列。", {
      blocked: true,
      penalty: 18,
    });
  }

  if (requiresTrendDirection(state.entrySetup) && state.contextRoot === "TR") {
    fail("当前是 TR context，却在用趋势延续型 setup。", {
      caution: true,
      penalty: 12,
    });
  }

  if (
    state.contextRoot === "Trend" &&
    state.entrySetup === "Strong Trend Stop Entry" &&
    trendStrength.score < 4
  ) {
    fail("Strong Trend Stop Entry 需要非常干净的强趋势，但当前强度不够。", {
      blocked: true,
      penalty: 18,
    });
  }

  if (
    state.contextRoot === "Trend" &&
    ["H1", "L1"].includes(state.entrySetup) &&
    trendStrength.score < 3
  ) {
    fail("H1 / L1 更依赖趋势质量，目前不够强，容易变成追在末端。", {
      caution: true,
      penalty: 12,
    });
  }

  if (
    state.contextRoot === "Trend" &&
    state.trendBranch === "Breakout" &&
    state.breakoutStrength === "Strong" &&
    trendStrength.score < 3
  ) {
    fail("你把环境定义成 Strong Breakout，但趋势强度检查并不支持这个结论。", {
      caution: true,
      penalty: 14,
    });
  }

  if (
    state.direction === "short" &&
    state.contextRoot === "Trend" &&
    state.trendBranch === "Breakout" &&
    state.breakoutStrength === "Strong"
  ) {
    fail("强突破环境下逆向 Short，质量通常很差。", {
      caution: true,
      penalty: 14,
    });
  }

  const hardMistakes = new Set([
    "Revenge trading",
    "Scaling into a losing position",
    "Trading bigger than my defined size",
    "Do not stop the trade",
    "Enter without a clear criterion",
  ]);

  const cautionMistakes = new Set([
    "Trade against the trend",
    "Enter too early and not wait for the signal",
    "Exit too early because of fear",
    "Overtrading",
  ]);

  state.mistakes.forEach((mistake) => {
    if (hardMistakes.has(mistake)) {
      fail(`纪律错误：${mistake}`, { blocked: true, penalty: 18 });
      return;
    }
    if (cautionMistakes.has(mistake)) {
      fail(`纪律警告：${mistake}`, { caution: true, penalty: 10 });
    }
  });

  score = Math.max(0, score);

  return {
    decision: blocked ? "BLOCKED" : caution ? "CAUTION" : "ALLOWED",
    score,
    reasons,
    passes,
  };
}

function sortStats(map: Map<string, StatItem>) {
  return [...map.values()]
    .sort(
      (left, right) =>
        right.count - left.count || right.totalPnl - left.totalPnl,
    )
    .slice(0, 8);
}

function addStat(
  map: Map<string, StatItem>,
  label: string,
  pnl: number | null,
) {
  const item = map.get(label) ?? { label, count: 0, totalPnl: 0 };
  item.count += 1;
  item.totalPnl += pnl ?? 0;
  map.set(label, item);
}

function normalizeHistoryEntry(
  entry: Partial<HistoryEntry>,
): HistoryEntry | null {
  if (
    !entry ||
    typeof entry.id !== "string" ||
    typeof entry.savedAt !== "string" ||
    !entry.snapshot
  ) {
    return null;
  }

  return {
    id: entry.id,
    savedAt: entry.savedAt,
    updatedAt: entry.updatedAt,
    decision: (entry.decision as DecisionLevel) || "BLOCKED",
    score: typeof entry.score === "number" ? entry.score : 0,
    snapshot: entry.snapshot,
    finalPnl:
      typeof entry.finalPnl === "number" && Number.isFinite(entry.finalPnl)
        ? entry.finalPnl
        : null,
    tradeNotes: typeof entry.tradeNotes === "string" ? entry.tradeNotes : "",
  };
}

function checkboxClass(checked: boolean) {
  return checked ? "toggle active" : "toggle";
}

function trendVerdictClass(score: number) {
  if (score >= 4) return "trend-strong";
  if (score === 3) return "trend-tradable";
  if (score === 2) return "trend-weak";
  return "trend-poor";
}

export default function App() {
  const [form, setForm] = useState<FormState>(() =>
    loadJson(REMINDER_STATE_KEY, INITIAL_STATE),
  );
  const [history, setHistory] = useState<HistoryEntry[]>(() =>
    loadJson(HISTORY_KEY, []),
  );
  const [reminderLogs, setReminderLogs] = useState<ReminderLog[]>(() =>
    loadJson(REMINDER_LOG_KEY, []),
  );
  const [editingDecisionId, setEditingDecisionId] = useState<string | null>(
    null,
  );
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [showReminder, setShowReminder] = useState(false);
  const [nextReminderAt, setNextReminderAt] = useState("");
  const [reminderNotes, setReminderNotes] = useState("");
  const [reminderCheck, setReminderCheck] = useState<ReminderCheck>({
    premiseStillValid: true,
    contextChanged: false,
    stopStillInPlace: true,
    temptedToScaleIn: false,
    measuredMoveUpdated: true,
  });
  const [fileHandle, setFileHandle] = useState<AnyFileHandle | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileStatus, setFileStatus] = useState("当前仍使用浏览器临时状态。");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const evaluation = evaluate(form);
  const playbook = derivePlaybook(form);
  const trendStrength = deriveTrendStrength(form);

  useEffect(() => {
    saveJson(REMINDER_STATE_KEY, form);
  }, [form]);

  useEffect(() => {
    saveJson(HISTORY_KEY, history);
  }, [history]);

  useEffect(() => {
    saveJson(REMINDER_LOG_KEY, reminderLogs);
  }, [reminderLogs]);

  useEffect(() => {
    if (!fileHandle || typeof fileHandle.createWritable !== "function") {
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        const writable = await fileHandle.createWritable?.();
        await writable?.write(
          JSON.stringify(
            {
              version: 2,
              exportedAt: new Date().toISOString(),
              draft: form,
              decisions: history,
              reminders: reminderLogs,
            } satisfies JournalFile,
            null,
            2,
          ),
        );
        await writable?.close();
        setFileStatus(`已保存到 ${fileName || fileHandle.name || "本地文件"}`);
      } catch {
        setFileStatus("自动写入本地文件失败，请手动重新保存。");
      }
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [fileHandle, fileName, form, history, reminderLogs]);

  useEffect(() => {
    if (!form.activeTrade) {
      setNextReminderAt("");
      return undefined;
    }

    const triggerReminder = () => {
      setReminderCheck({
        premiseStillValid: true,
        contextChanged: false,
        stopStillInPlace: true,
        temptedToScaleIn: false,
        measuredMoveUpdated: true,
      });
      setReminderNotes("");
      setShowReminder(true);

      if (
        "Notification" in window &&
        Notification.permission === "granted" &&
        document.hidden
      ) {
        new Notification("Brooks Discipline Reminder", {
          body: "5 分钟到了。请检查 premise 是否仍成立、context 是否改变。",
        });
      }
    };

    const firstBoundary = nextFiveMinuteBoundary(new Date());
    setNextReminderAt(formatReminderTime(firstBoundary));
    let intervalId: number | null = null;

    const timeoutId = window.setTimeout(() => {
      triggerReminder();
      const nextBoundary = nextFiveMinuteBoundary(new Date());
      setNextReminderAt(formatReminderTime(nextBoundary));

      intervalId = window.setInterval(() => {
        triggerReminder();
        const next = nextFiveMinuteBoundary(new Date());
        setNextReminderAt(formatReminderTime(next));
      }, REMINDER_INTERVAL_MS);
    }, firstBoundary.getTime() - Date.now());

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId != null) {
        window.clearInterval(intervalId);
      }
    };
  }, [form.activeTrade]);

  const filterOptions = useMemo(() => {
    const decisions = [...new Set(history.map((entry) => entry.decision))];
    const contexts = [
      ...new Set(history.map((entry) => formatContext(entry.snapshot))),
    ];
    const opens = [
      ...new Set(
        history.map((entry) => entry.snapshot.openPattern || "Undefined"),
      ),
    ];
    const days = [
      ...new Set(
        history.map((entry) => entry.snapshot.dayPattern || "Undefined"),
      ),
    ];
    const setups = [
      ...new Set(
        history.map((entry) => entry.snapshot.entrySetup || "Undefined"),
      ),
    ];
    const errors = [
      ...new Set(
        history.flatMap((entry) =>
          entry.snapshot.mistakes.length > 0
            ? entry.snapshot.mistakes
            : ["none"],
        ),
      ),
    ];

    return {
      decisions,
      contexts,
      opens,
      days,
      setups,
      errors,
    };
  }, [history]);

  const filteredHistory = useMemo(() => {
    return history.filter((entry) => {
      const context = formatContext(entry.snapshot);
      const errors =
        entry.snapshot.mistakes.length > 0 ? entry.snapshot.mistakes : ["none"];

      if (filters.decision && entry.decision !== filters.decision) return false;
      if (filters.context && context !== filters.context) return false;
      if (
        filters.open &&
        (entry.snapshot.openPattern || "Undefined") !== filters.open
      )
        return false;
      if (
        filters.day &&
        (entry.snapshot.dayPattern || "Undefined") !== filters.day
      )
        return false;
      if (
        filters.setup &&
        (entry.snapshot.entrySetup || "Undefined") !== filters.setup
      )
        return false;
      if (filters.error && !errors.includes(filters.error)) return false;
      return true;
    });
  }, [filters, history]);

  const summary = useMemo(() => {
    const pnlValues = filteredHistory
      .map((entry) => entry.finalPnl)
      .filter((value): value is number => value != null);
    const totalPnl = pnlValues.reduce((sum, value) => sum + value, 0);
    const wins = pnlValues.filter((value) => value > 0).length;
    const losses = pnlValues.filter((value) => value < 0).length;
    return {
      records: filteredHistory.length,
      pnlRecords: pnlValues.length,
      totalPnl,
      avgPnl: pnlValues.length ? totalPnl / pnlValues.length : 0,
      wins,
      losses,
      open: filteredHistory.length - pnlValues.length,
    };
  }, [filteredHistory]);

  const dashboards = useMemo(() => {
    const decisionMap = new Map<string, StatItem>();
    const contextMap = new Map<string, StatItem>();
    const openMap = new Map<string, StatItem>();
    const dayMap = new Map<string, StatItem>();
    const setupMap = new Map<string, StatItem>();
    const mistakeMap = new Map<string, StatItem>();

    filteredHistory.forEach((entry) => {
      const pnl = entry.finalPnl;
      addStat(decisionMap, entry.decision, pnl);
      addStat(contextMap, formatContext(entry.snapshot), pnl);
      addStat(openMap, entry.snapshot.openPattern || "Undefined", pnl);
      addStat(dayMap, entry.snapshot.dayPattern || "Undefined", pnl);
      addStat(setupMap, entry.snapshot.entrySetup || "Undefined", pnl);

      if (entry.snapshot.mistakes.length === 0) {
        addStat(mistakeMap, "none", pnl);
      } else {
        entry.snapshot.mistakes.forEach((mistake) =>
          addStat(mistakeMap, mistake, pnl),
        );
      }
    });

    return {
      decisions: sortStats(decisionMap),
      contexts: sortStats(contextMap),
      opens: sortStats(openMap),
      days: sortStats(dayMap),
      setups: sortStats(setupMap),
      mistakes: sortStats(mistakeMap),
    };
  }, [filteredHistory]);

  const dashboardSections: Array<[string, StatItem[]]> = [
    ["Decision", dashboards.decisions],
    ["Context", dashboards.contexts],
    ["Open", dashboards.opens],
    ["Day", dashboards.days],
    ["Setup", dashboards.setups],
    ["Errors", dashboards.mistakes],
  ];

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateFilter<K extends keyof FilterState>(
    key: K,
    value: FilterState[K],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function toggleMistake(mistake: string) {
    setForm((current) => {
      const exists = current.mistakes.includes(mistake);
      return {
        ...current,
        mistakes: exists
          ? current.mistakes.filter((item) => item !== mistake)
          : [...current.mistakes, mistake],
      };
    });
  }

  function resetContextBranch(partial: Partial<FormState>) {
    setForm((current) => ({
      ...current,
      ...partial,
      trendBranch: partial.contextRoot === "Trend" ? current.trendBranch : "",
      breakoutStrength:
        partial.contextRoot === "Trend" ? current.breakoutStrength : "",
      channelWidth: partial.contextRoot === "Trend" ? current.channelWidth : "",
      trWidth: partial.contextRoot === "TR" ? current.trWidth : "",
    }));
  }

  function saveDecision() {
    const timestamp = new Date().toLocaleString("zh-CN");

    if (editingDecisionId) {
      setHistory((current) =>
        current.map((entry) =>
          entry.id === editingDecisionId
            ? {
                ...entry,
                updatedAt: timestamp,
                decision: evaluation.decision,
                score: evaluation.score,
                snapshot: form,
              }
            : entry,
        ),
      );
      setEditingDecisionId(null);
      return;
    }

    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      savedAt: timestamp,
      decision: evaluation.decision,
      score: evaluation.score,
      snapshot: form,
      finalPnl: null,
      tradeNotes: "",
    };
    setHistory((current) => [entry, ...current].slice(0, 300));
  }

  function startEditing(entry: HistoryEntry) {
    setForm(entry.snapshot);
    setEditingDecisionId(entry.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEditing() {
    setEditingDecisionId(null);
  }

  function updateHistoryEntry(
    entryId: string,
    patch: Partial<Pick<HistoryEntry, "finalPnl" | "tradeNotes">>,
  ) {
    setHistory((current) =>
      current.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              ...patch,
              updatedAt: new Date().toLocaleString("zh-CN"),
            }
          : entry,
      ),
    );
  }

  function deleteHistoryEntry(entryId: string) {
    setHistory((current) => current.filter((entry) => entry.id !== entryId));
    if (editingDecisionId === entryId) {
      setEditingDecisionId(null);
    }
  }

  function saveReminderReview() {
    const entry: ReminderLog = {
      id: crypto.randomUUID(),
      timestamp: new Date().toLocaleString("zh-CN"),
      check: reminderCheck,
      notes: reminderNotes,
    };
    setReminderLogs((current) => [entry, ...current].slice(0, 500));

    if (
      !reminderCheck.premiseStillValid ||
      reminderCheck.contextChanged ||
      !reminderCheck.stopStillInPlace
    ) {
      setForm((current) => ({ ...current, activeTrade: false }));
    }

    setShowReminder(false);
  }

  async function enableNotifications() {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
  }

  async function createOrBindJournalFile() {
    const picker = (
      window as Window & typeof globalThis & { showSaveFilePicker?: Function }
    ).showSaveFilePicker;

    if (!picker) {
      setFileStatus("当前浏览器不支持直接写本地文件，请用导出按钮下载 JSON。");
      return;
    }

    try {
      const handle = (await picker({
        suggestedName: "brooks-discipline-journal.json",
        types: [
          {
            description: "JSON Files",
            accept: {
              "application/json": [".json"],
            },
          },
        ],
      })) as AnyFileHandle;

      setFileHandle(handle);
      setFileName(handle.name || "brooks-discipline-journal.json");
      setFileStatus(
        `已绑定本地文件：${handle.name || "brooks-discipline-journal.json"}`,
      );
    } catch {
      setFileStatus("没有选择日志文件。");
    }
  }

  async function manualSaveToFile() {
    const journal: JournalFile = {
      version: 2,
      exportedAt: new Date().toISOString(),
      draft: form,
      decisions: history,
      reminders: reminderLogs,
    };

    if (fileHandle && typeof fileHandle.createWritable === "function") {
      try {
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(journal, null, 2));
        await writable.close();
        setFileStatus(
          `已手动保存到 ${fileName || fileHandle.name || "本地文件"}`,
        );
        return;
      } catch {
        setFileStatus("手动保存失败，请重新选择文件。");
      }
    }

    const blob = new Blob([JSON.stringify(journal, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "brooks-discipline-journal.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setFileStatus("浏览器已下载 JSON 文件。");
  }

  function triggerImport() {
    fileInputRef.current?.click();
  }

  async function importFromFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as Partial<JournalFile>;

      if (parsed.draft) setForm(parsed.draft);
      setHistory(
        Array.isArray(parsed.decisions)
          ? parsed.decisions
              .map((entry) =>
                normalizeHistoryEntry(entry as Partial<HistoryEntry>),
              )
              .filter((entry): entry is HistoryEntry => entry != null)
          : [],
      );
      setReminderLogs(Array.isArray(parsed.reminders) ? parsed.reminders : []);
      setEditingDecisionId(null);
      setFileHandle(null);
      setFileName(file.name);
      setFileStatus(`已导入 ${file.name}`);
    } catch {
      setFileStatus("导入失败：文件不是有效的日志 JSON。");
    } finally {
      event.target.value = "";
    }
  }

  function clearLocalLists() {
    setHistory([]);
    setReminderLogs([]);
    setEditingDecisionId(null);
    setFilters(EMPTY_FILTERS);
    setFileStatus("已清空页面内记录。");
  }

  return (
    <div className="shell">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden-input"
        onChange={importFromFile}
      />

      <header className="hero">
        <div>
          <p className="eyebrow">Brooks Price Action Discipline System</p>
          <h1>先分类，再等待，再执行。</h1>
          <p className="hero-copy">
            这不是自动做单系统，而是纪律闸门。它强制你先定义 market
            context、entry setup、 premise 和
            invalidation，再决定这笔交易能不能做，并把记录保存到本地 JSON 文件。
          </p>
        </div>
        <div className="hero-actions">
          <button className="primary" onClick={saveDecision}>
            {editingDecisionId ? "更新这条记录" : "保存这次决策"}
          </button>
          {editingDecisionId ? (
            <button className="secondary" onClick={cancelEditing}>
              取消编辑
            </button>
          ) : null}
          <button className="secondary" onClick={createOrBindJournalFile}>
            绑定日志文件
          </button>
          <button className="secondary" onClick={manualSaveToFile}>
            保存到本地文件
          </button>
          <button className="secondary" onClick={triggerImport}>
            导入日志文件
          </button>
          <button className="secondary" onClick={enableNotifications}>
            开启系统提醒
          </button>
        </div>
      </header>

      <section className="panel status-strip">
        <div>
          <span className="status-label">Journal Status</span>
          <strong>{fileStatus}</strong>
        </div>
        <div className="pill-row">
          <span className="pill">Decisions {history.length}</span>
          <span className="pill">Reminders {reminderLogs.length}</span>
          <span className="pill">Current file {fileName || "未绑定"}</span>
          <span className="pill">
            {form.activeTrade && nextReminderAt
              ? `下次复查 ${nextReminderAt}`
              : "复查未启动"}
          </span>
        </div>
      </section>

      <section className="board">
        <article className="panel wide open-day-panel">
          <h2>Open / Day</h2>
          <div className="two-column">
            <div>
              <h3>Open Pattern</h3>
              <div className="chip-grid">
                {OPEN_PATTERNS.map((pattern) => (
                  <button
                    key={pattern}
                    className={
                      form.openPattern === pattern ? "chip selected" : "chip"
                    }
                    onClick={() => updateField("openPattern", pattern)}
                  >
                    {pattern}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3>Day Pattern</h3>
              <div className="chip-grid">
                {DAY_PATTERNS.map((pattern) => (
                  <button
                    key={pattern}
                    className={
                      form.dayPattern === pattern ? "chip selected" : "chip"
                    }
                    onClick={() => updateField("dayPattern", pattern)}
                  >
                    {pattern}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </article>

        <article className="panel wide context-panel">
          <h2>Context Tree</h2>
          <div className="tree-grid">
            <div>
              <h3>Root</h3>
              <div className="chip-grid">
                {["Trend", "TR"].map((value) => (
                  <button
                    key={value}
                    className={
                      form.contextRoot === value ? "chip selected" : "chip"
                    }
                    onClick={() =>
                      resetContextBranch({
                        contextRoot: value as ContextRoot,
                        trendBranch: "",
                        breakoutStrength: "",
                        channelWidth: "",
                        trWidth: "",
                      })
                    }
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>

            {form.contextRoot === "Trend" ? (
              <>
                <div>
                  <h3>Trend Branch</h3>
                  <div className="chip-grid">
                    {["Breakout", "Channel"].map((value) => (
                      <button
                        key={value}
                        className={
                          form.trendBranch === value ? "chip selected" : "chip"
                        }
                        onClick={() =>
                          updateField("trendBranch", value as TrendBranch)
                        }
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>

                {form.trendBranch === "Breakout" ? (
                  <div>
                    <h3>Breakout Quality</h3>
                    <div className="chip-grid">
                      {["Strong", "Weak"].map((value) => (
                        <button
                          key={value}
                          className={
                            form.breakoutStrength === value
                              ? "chip selected"
                              : "chip"
                          }
                          onClick={() =>
                            updateField(
                              "breakoutStrength",
                              value as BreakoutStrength,
                            )
                          }
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {form.trendBranch === "Channel" ? (
                  <div>
                    <h3>Channel Width</h3>
                    <div className="chip-grid">
                      {["Tight", "Broad"].map((value) => (
                        <button
                          key={value}
                          className={
                            form.channelWidth === value
                              ? "chip selected"
                              : "chip"
                          }
                          onClick={() =>
                            updateField("channelWidth", value as ChannelWidth)
                          }
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            {form.contextRoot === "TR" ? (
              <div>
                <h3>TR Width</h3>
                <div className="chip-grid">
                  {["Tight", "Broad"].map((value) => (
                    <button
                      key={value}
                      className={
                        form.trWidth === value ? "chip selected" : "chip"
                      }
                      onClick={() => updateField("trWidth", value as TrWidth)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="playbook-box context-playbook">
            <span className="label">Recommended Playbook</span>
            <strong>{playbook}</strong>
          </div>
        </article>

        <article className="panel entry-panel">
          <h2>Entry Setup</h2>
          <div className="setup-list">
            {ENTRY_SETUPS.map((setup) => (
              <button
                key={setup.value}
                className={
                  form.entrySetup === setup.value
                    ? "setup-card selected"
                    : "setup-card"
                }
                onClick={() => updateField("entrySetup", setup.value)}
              >
                <strong>{setup.title}</strong>
                <span>{setup.description}</span>
              </button>
            ))}
          </div>
        </article>

        <article className="panel guardrail-panel">
          <h2>Guardrails</h2>
          <div className="guardrail-list">
            <button
              className={checkboxClass(form.needConfirmation)}
              onClick={() =>
                updateField("needConfirmation", !form.needConfirmation)
              }
            >
              <strong>Wait for Confirmation</strong>
              <span>
                把 `Second Entry` 和 `Follow-Through`
                合并成一个闸门：没有更多确认，就不进场。
              </span>
            </button>
            <button
              className={checkboxClass(form.measuredMoveChecked)}
              onClick={() =>
                updateField("measuredMoveChecked", !form.measuredMoveChecked)
              }
            >
              <strong>Measured Move Checked</strong>
              <span>先测量，再决定是否还值得追，避免盲目抄底摸顶。</span>
            </button>
          </div>
        </article>

        <article className="panel trend-panel">
          <h2>Trend Strength</h2>
          <div className="guardrail-list">
            <button
              className={checkboxClass(form.trendBodyHealthy)}
              onClick={() =>
                updateField("trendBodyHealthy", !form.trendBodyHealthy)
              }
            >
              <strong>Body Size Healthy</strong>
              <span>推进段的 K 线实体仍然够大，不是连续小实体磨行。</span>
            </button>
            <button
              className={checkboxClass(form.trendLowOverlap)}
              onClick={() =>
                updateField("trendLowOverlap", !form.trendLowOverlap)
              }
            >
              <strong>Low Overlap</strong>
              <span>相邻 K 线重叠少，推进段仍然干净，没有明显拉扯。</span>
            </button>
            <button
              className={checkboxClass(form.trendShallowPullback)}
              onClick={() =>
                updateField(
                  "trendShallowPullback",
                  !form.trendShallowPullback,
                )
              }
            >
              <strong>Shallow Pullback</strong>
              <span>回调仍然浅，没有明显深回撤破坏节奏。</span>
            </button>
            <button
              className={checkboxClass(form.trendEmaSteep)}
              onClick={() => updateField("trendEmaSteep", !form.trendEmaSteep)}
            >
              <strong>EMA Still Steep</strong>
              <span>EMA 仍然陡峭，说明趋势斜率没有明显衰减。</span>
            </button>
          </div>

          <div
            className={`playbook-box trend-verdict ${trendVerdictClass(
              trendStrength.score,
            )}`}
          >
            <span className="label">Trend Strength Verdict</span>
            <strong>
              {trendStrength.label} ({trendStrength.score}/4)
            </strong>
            <p className="hero-copy trend-copy">{trendStrength.summary}</p>
          </div>
        </article>

        <article className="panel plan-panel">
          <h2>Trade Plan</h2>
          <div className="form-grid">
            <label>
              <span>Direction</span>
              <select
                value={form.direction}
                onChange={(event) =>
                  updateField("direction", event.target.value as Direction)
                }
              >
                <option value="">请选择</option>
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
            </label>
            <label>
              <span>Instrument</span>
              <input
                value={form.instrument}
                onChange={(event) =>
                  updateField("instrument", event.target.value)
                }
                placeholder="ES / MES / NQ"
              />
            </label>
            <label>
              <span>Entry Price</span>
              <input
                value={form.entryPrice}
                onChange={(event) =>
                  updateField("entryPrice", event.target.value)
                }
                placeholder="可选"
              />
            </label>
            <label>
              <span>Stop Price</span>
              <input
                value={form.stopPrice}
                onChange={(event) =>
                  updateField("stopPrice", event.target.value)
                }
                placeholder="必须有"
              />
            </label>
            <label>
              <span>Planned Risk</span>
              <input
                value={form.plannedRisk}
                onChange={(event) =>
                  updateField("plannedRisk", event.target.value)
                }
                placeholder="1R 或 200"
              />
            </label>
            <label>
              <span>Planned Size</span>
              <input
                value={form.plannedSize}
                onChange={(event) =>
                  updateField("plannedSize", event.target.value)
                }
                placeholder="2"
              />
            </label>
            <label>
              <span>Max Size</span>
              <input
                value={form.maxSize}
                onChange={(event) => updateField("maxSize", event.target.value)}
                placeholder="2"
              />
            </label>
            <label>
              <span>Trades Today</span>
              <input
                value={form.tradesToday}
                onChange={(event) =>
                  updateField("tradesToday", event.target.value)
                }
                placeholder="1"
              />
            </label>
          </div>

          <label className="text-area-field">
            <span>Premise</span>
            <textarea
              rows={4}
              value={form.premise}
              onChange={(event) => updateField("premise", event.target.value)}
              placeholder="为什么这笔交易成立？当前 reading 是什么？"
            />
          </label>
          <label className="text-area-field">
            <span>Premise Invalidation</span>
            <textarea
              rows={3}
              value={form.premiseInvalidation}
              onChange={(event) =>
                updateField("premiseInvalidation", event.target.value)
              }
              placeholder="什么现象出现就说明 premise 不成立？"
            />
          </label>
          <label className="text-area-field">
            <span>Take Profit Plan</span>
            <textarea
              rows={3}
              value={form.takeProfitPlan}
              onChange={(event) =>
                updateField("takeProfitPlan", event.target.value)
              }
              placeholder="Measured move、swing target、trail stop 或其他退出计划。"
            />
          </label>
        </article>

        <article className="panel mistakes-panel">
          <h2>Discipline Mistakes</h2>
          <div className="mistake-list">
            {DISCIPLINE_MISTAKES.map((mistake) => (
              <button
                key={mistake}
                className={
                  form.mistakes.includes(mistake)
                    ? "mistake selected"
                    : "mistake"
                }
                onClick={() => toggleMistake(mistake)}
              >
                {mistake}
              </button>
            ))}
          </div>
        </article>

        <article className="panel decision-panel emphasis-panel">
          <h2>Decision Engine</h2>
          <div className={`decision ${evaluation.decision.toLowerCase()}`}>
            {evaluation.decision}
          </div>
          <div className="score">{evaluation.score}</div>
          <div className="decision-actions">
            <button
              className={form.activeTrade ? "secondary active" : "secondary"}
              onClick={() => updateField("activeTrade", !form.activeTrade)}
            >
              {form.activeTrade ? "停止 5 分钟复查" : "启动 5 分钟复查"}
            </button>
            <button className="secondary danger" onClick={clearLocalLists}>
              清空页面记录
            </button>
          </div>

          <div className="list-block">
            <h3>Why</h3>
            <ul>
              {(evaluation.reasons.length
                ? evaluation.reasons
                : ["当前没有触发阻止规则。"]
              ).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>

          <div className="list-block">
            <h3>Pass Checks</h3>
            <ul>
              {evaluation.passes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </article>

        <article className="panel wide filters-panel">
          <h2>Filters & Summary</h2>
          <div className="form-grid filters-grid">
            <label>
              <span>Decision</span>
              <select
                value={filters.decision}
                onChange={(event) =>
                  updateFilter("decision", event.target.value)
                }
              >
                <option value="">All</option>
                {filterOptions.decisions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Context</span>
              <select
                value={filters.context}
                onChange={(event) =>
                  updateFilter("context", event.target.value)
                }
              >
                <option value="">All</option>
                {filterOptions.contexts.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Open</span>
              <select
                value={filters.open}
                onChange={(event) => updateFilter("open", event.target.value)}
              >
                <option value="">All</option>
                {filterOptions.opens.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Day</span>
              <select
                value={filters.day}
                onChange={(event) => updateFilter("day", event.target.value)}
              >
                <option value="">All</option>
                {filterOptions.days.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Setup</span>
              <select
                value={filters.setup}
                onChange={(event) => updateFilter("setup", event.target.value)}
              >
                <option value="">All</option>
                {filterOptions.setups.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Error</span>
              <select
                value={filters.error}
                onChange={(event) => updateFilter("error", event.target.value)}
              >
                <option value="">All</option>
                {filterOptions.errors.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="pill-row summary-row">
            <span className="pill">Records {summary.records}</span>
            <span className="pill">Recorded P&L {summary.pnlRecords}</span>
            <span className="pill">
              Total P&L {summary.totalPnl.toFixed(2)}
            </span>
            <span className="pill">Avg P&L {summary.avgPnl.toFixed(2)}</span>
            <span className="pill">Wins {summary.wins}</span>
            <span className="pill">Losses {summary.losses}</span>
            <span className="pill">Open {summary.open}</span>
          </div>
        </article>

        <article className="panel wide dashboard-panel">
          <h2>Classification Dashboard</h2>
          <div className="history-grid stats-grid">
            {dashboardSections.map(([title, items]) => (
              <section key={title} className="history-card">
                <header>
                  <strong>{title}</strong>
                </header>
                {items.length === 0 ? (
                  <p className="empty">暂无数据</p>
                ) : (
                  items.map((item) => (
                    <div key={item.label} className="stat-line">
                      <div>
                        <strong>{item.label}</strong>
                        <span>{item.count} records</span>
                      </div>
                      <div className="stat-pnl">{item.totalPnl.toFixed(2)}</div>
                    </div>
                  ))
                )}
              </section>
            ))}
          </div>
        </article>

        <article className="panel wide history-panel">
          <h2>Saved Decisions</h2>
          {filteredHistory.length === 0 ? (
            <p className="empty">当前筛选条件下没有记录。</p>
          ) : (
            <div className="history-grid decision-history-grid">
              {filteredHistory.map((entry) => (
                <article key={entry.id} className="history-card">
                  <header>
                    <strong>{entry.decision}</strong>
                    <span>{entry.updatedAt || entry.savedAt}</span>
                  </header>

                  <div className="meta">
                    {entry.snapshot.instrument} |{" "}
                    {entry.snapshot.direction || "no direction"} |{" "}
                    {formatContext(entry.snapshot)} |{" "}
                    {entry.snapshot.entrySetup || "no setup"} | score{" "}
                    {entry.score}
                  </div>

                  <p>{entry.snapshot.premise || "无 premise"}</p>

                  <div className="form-grid card-editor">
                    <label>
                      <span>Final P&L</span>
                      <input
                        value={entry.finalPnl ?? ""}
                        onChange={(event) =>
                          updateHistoryEntry(entry.id, {
                            finalPnl: toNumber(event.target.value),
                          })
                        }
                        placeholder="例如 120 或 -80"
                      />
                    </label>
                    <label>
                      <span>Trade Notes</span>
                      <textarea
                        rows={2}
                        value={entry.tradeNotes}
                        onChange={(event) =>
                          updateHistoryEntry(entry.id, {
                            tradeNotes: event.target.value,
                          })
                        }
                        placeholder="结果、错误、复盘结论"
                      />
                    </label>
                  </div>

                  <div className="pill-row">
                    <span className="pill">
                      Open {entry.snapshot.openPattern || "Undefined"}
                    </span>
                    <span className="pill">
                      Day {entry.snapshot.dayPattern || "Undefined"}
                    </span>
                    <span className="pill">
                      Setup {entry.snapshot.entrySetup || "Undefined"}
                    </span>
                    <span className="pill">
                      P&L{" "}
                      {entry.finalPnl == null
                        ? "open"
                        : entry.finalPnl.toFixed(2)}
                    </span>
                  </div>

                  <div className="decision-actions">
                    <button
                      className="secondary"
                      onClick={() => startEditing(entry)}
                    >
                      编辑到表单
                    </button>
                    <button
                      className="secondary danger"
                      onClick={() => deleteHistoryEntry(entry.id)}
                    >
                      删除
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </article>

        <article className="panel wide reminder-panel">
          <h2>Reminder Reviews</h2>
          {reminderLogs.length === 0 ? (
            <p className="empty">还没有 5 分钟复查记录。</p>
          ) : (
            <div className="history-grid">
              {reminderLogs.map((entry) => (
                <article key={entry.id} className="history-card">
                  <header>
                    <strong>{entry.timestamp}</strong>
                  </header>
                  <div className="pill-row">
                    <span className="pill">
                      premise{" "}
                      {entry.check.premiseStillValid ? "valid" : "broken"}
                    </span>
                    <span className="pill">
                      context{" "}
                      {entry.check.contextChanged ? "changed" : "stable"}
                    </span>
                    <span className="pill">
                      stop {entry.check.stopStillInPlace ? "on" : "missing"}
                    </span>
                    <span className="pill">
                      scale-in {entry.check.temptedToScaleIn ? "tempted" : "no"}
                    </span>
                  </div>
                  <p>{entry.notes || "无备注"}</p>
                </article>
              ))}
            </div>
          )}
        </article>
      </section>

      {showReminder ? (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>5 分钟复查</h2>
            <p>
              现在是整数 5 分钟节点，请检查 premise 是否仍成立、context
              是否改变。
            </p>

            <div className="reminder-grid">
              <label className={checkboxClass(reminderCheck.premiseStillValid)}>
                <input
                  type="checkbox"
                  checked={reminderCheck.premiseStillValid}
                  onChange={(event) =>
                    setReminderCheck((current) => ({
                      ...current,
                      premiseStillValid: event.target.checked,
                    }))
                  }
                />
                <span>Premise still valid</span>
              </label>

              <label
                className={checkboxClass(reminderCheck.measuredMoveUpdated)}
              >
                <input
                  type="checkbox"
                  checked={reminderCheck.measuredMoveUpdated}
                  onChange={(event) =>
                    setReminderCheck((current) => ({
                      ...current,
                      measuredMoveUpdated: event.target.checked,
                    }))
                  }
                />
                <span>Measured Move / target rechecked</span>
              </label>

              <label className={checkboxClass(reminderCheck.stopStillInPlace)}>
                <input
                  type="checkbox"
                  checked={reminderCheck.stopStillInPlace}
                  onChange={(event) =>
                    setReminderCheck((current) => ({
                      ...current,
                      stopStillInPlace: event.target.checked,
                    }))
                  }
                />
                <span>Stop still in place</span>
              </label>

              <label className={checkboxClass(reminderCheck.contextChanged)}>
                <input
                  type="checkbox"
                  checked={reminderCheck.contextChanged}
                  onChange={(event) =>
                    setReminderCheck((current) => ({
                      ...current,
                      contextChanged: event.target.checked,
                    }))
                  }
                />
                <span>Context changed</span>
              </label>

              <label className={checkboxClass(reminderCheck.temptedToScaleIn)}>
                <input
                  type="checkbox"
                  checked={reminderCheck.temptedToScaleIn}
                  onChange={(event) =>
                    setReminderCheck((current) => ({
                      ...current,
                      temptedToScaleIn: event.target.checked,
                    }))
                  }
                />
                <span>Tempted to scale into loser</span>
              </label>
            </div>

            <label className="text-area-field">
              <span>Review Notes</span>
              <textarea
                rows={4}
                value={reminderNotes}
                onChange={(event) => setReminderNotes(event.target.value)}
                placeholder="例如：price failed at prior high, context shifted from strong breakout to broad channel."
              />
            </label>

            <div className="modal-actions">
              <button
                className="secondary"
                onClick={() => setShowReminder(false)}
              >
                稍后再看
              </button>
              <button className="primary" onClick={saveReminderReview}>
                保存复查
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
