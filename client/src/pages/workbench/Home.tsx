import { useEffect, useRef, useState } from "react";
import { fetchPulse, type PulseResult } from "../../api/market";

const STORAGE_KEY = "opshub-pulse-keywords-v1";
const STORAGE_MKT  = "opshub-pulse-marketplace";

const MARKETPLACES = [
  { code: "US", flag: "🇺🇸" }, { code: "UK", flag: "🇬🇧" },
  { code: "DE", flag: "🇩🇪" }, { code: "JP", flag: "🇯🇵" },
  { code: "CA", flag: "🇨🇦" }, { code: "FR", flag: "🇫🇷" },
  { code: "AU", flag: "🇦🇺" }, { code: "IT", flag: "🇮🇹" },
];

type CardState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; data: PulseResult; ts: number }
  | { kind: "err"; msg: string };

function loadKeywords(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveKeywords(kws: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(kws));
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 80, h = 28;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = values[values.length - 1];
  const prev = values[values.length - 2];
  const color = last >= prev ? "var(--acc)" : "var(--red)";
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// ── Parse helpers ─────────────────────────────────────────────────────────────

function num(v: any): number | null {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function fmtVol(v: number | null): string {
  if (v === null) return "—";
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(0) + "K";
  return String(v);
}

function parseDetail(d: Record<string, any> | null) {
  if (!d) return null;
  // Sorftime wraps data in various shapes — flatten common patterns
  const root = d.data ?? d;
  return {
    searchVolume:    num(root.searchVolume   ?? root.search_volume   ?? root.searches    ?? null),
    competition:     num(root.competitionIndex ?? root.competition_index ?? root.competition ?? null),
    cpc:             num(root.averageCpc      ?? root.average_cpc      ?? root.cpc         ?? null),
    purchaseRate:    num(root.purchaseRate    ?? root.purchase_rate    ?? root.buyRate      ?? null),
    conversionRate:  num(root.conversionRate  ?? root.conversion_rate  ?? null),
  };
}

function parseTrend(t: Record<string, any> | null): number[] {
  if (!t) return [];
  const arr: any[] =
    t.data ?? t.trend ?? t.results ?? t.items ?? (Array.isArray(t) ? t : []);
  return arr
    .map((item: any) =>
      parseFloat(item?.searchVolume ?? item?.search_volume ?? item?.value ?? item?.searches ?? "")
    )
    .filter((n) => !isNaN(n))
    .slice(-12);
}

// ── Keyword card ──────────────────────────────────────────────────────────────

function KeywordCard({
  keyword, state, onRemove,
}: {
  keyword: string;
  state: CardState;
  onRemove: () => void;
}) {
  const detail = state.kind === "ok" ? parseDetail(state.data.detail) : null;
  const trend  = state.kind === "ok" ? parseTrend(state.data.trend)   : [];

  return (
    <div className="pulse-card">
      <div className="pulse-card-hd">
        <span className="pulse-kw">{keyword}</span>
        <button className="pulse-rm" onClick={onRemove} title="移除">✕</button>
      </div>

      {state.kind === "idle" && (
        <div className="pulse-empty">点击刷新获取数据</div>
      )}
      {state.kind === "loading" && (
        <div className="pulse-loading">
          <span className="pulse-spin">◌</span> 查询中…
        </div>
      )}
      {state.kind === "err" && (
        <div className="pulse-err">⚠ {state.msg}</div>
      )}
      {state.kind === "ok" && (
        <>
          <div className="pulse-metrics">
            <Metric label="月搜索量" value={fmtVol(detail?.searchVolume ?? null)} />
            <Metric label="竞争指数" value={detail?.competition !== null ? String(Math.round(detail!.competition!)) : "—"} accent={
              detail?.competition !== null ? (detail!.competition! > 70 ? "red" : detail!.competition! > 40 ? "amber" : "acc") : undefined
            } />
            <Metric label="平均CPC" value={detail?.cpc !== null ? `$${detail!.cpc!.toFixed(2)}` : "—"} />
            <Metric label="购买率" value={detail?.purchaseRate !== null ? `${(detail!.purchaseRate! * 100).toFixed(1)}%` : "—"} />
          </div>
          {trend.length >= 2 && (
            <div className="pulse-trend">
              <Sparkline values={trend} />
              <span className="pulse-trend-label">近{trend.length}月趋势</span>
            </div>
          )}
          <div className="pulse-ts">{new Date(state.ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</div>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: "acc" | "amber" | "red" }) {
  const color = accent === "acc" ? "var(--acc)" : accent === "amber" ? "var(--amber)" : accent === "red" ? "var(--red)" : "var(--t)";
  return (
    <div className="pulse-metric">
      <div className="pulse-metric-label">{label}</div>
      <div className="pulse-metric-value" style={{ color }}>{value}</div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Home() {
  const [keywords, setKeywords] = useState<string[]>(loadKeywords);
  const [marketplace, setMarketplace] = useState(
    () => localStorage.getItem(STORAGE_MKT) || "US"
  );
  const [states, setStates] = useState<Record<string, CardState>>({});
  const [input, setInput] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { saveKeywords(keywords); }, [keywords]);
  useEffect(() => { localStorage.setItem(STORAGE_MKT, marketplace); }, [marketplace]);

  const addKeyword = () => {
    const kw = input.trim().toLowerCase();
    if (!kw || keywords.includes(kw)) { setInput(""); return; }
    setKeywords((prev) => [...prev, kw]);
    setInput("");
    inputRef.current?.focus();
  };

  const removeKeyword = (kw: string) => {
    setKeywords((prev) => prev.filter((k) => k !== kw));
    setStates((prev) => { const next = { ...prev }; delete next[kw]; return next; });
  };

  const fetchOne = async (kw: string, mkt: string) => {
    setStates((prev) => ({ ...prev, [kw]: { kind: "loading" } }));
    try {
      const result = await fetchPulse(kw, mkt);
      setStates((prev) => ({ ...prev, [kw]: { kind: "ok", data: result, ts: Date.now() } }));
    } catch (e: any) {
      setStates((prev) => ({ ...prev, [kw]: { kind: "err", msg: e?.message || "请求失败" } }));
    }
  };

  const refreshAll = async () => {
    if (refreshing || keywords.length === 0) return;
    setRefreshing(true);
    await Promise.all(keywords.map((kw) => fetchOne(kw, marketplace)));
    setRefreshing(false);
  };

  const mktLabel = MARKETPLACES.find((m) => m.code === marketplace);

  return (
    <div className="pulse-page">
      {/* Header */}
      <div className="pulse-header">
        <span className="pulse-header-title">
          <span style={{ color: "var(--acc)" }}>◈</span> 关键词监控台
        </span>

        {/* Marketplace selector */}
        <select
          className="pulse-mkt-select"
          value={marketplace}
          onChange={(e) => setMarketplace(e.target.value)}
        >
          {MARKETPLACES.map((m) => (
            <option key={m.code} value={m.code}>{m.flag} {m.code}</option>
          ))}
        </select>

        <button
          className={"tbtn tbtn-acc" + (refreshing ? " pulse-spinning" : "")}
          onClick={refreshAll}
          disabled={refreshing || keywords.length === 0}
          title="刷新所有关键词"
        >
          {refreshing ? "查询中…" : "↻ 全部刷新"}
        </button>
      </div>

      {/* Add keyword row */}
      <div className="pulse-add-row">
        <input
          ref={inputRef}
          className="pulse-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addKeyword()}
          placeholder="添加关键词，如 wireless earbuds…"
        />
        <button className="tbtn" onClick={addKeyword} disabled={!input.trim()}>
          + 添加
        </button>
      </div>

      {/* Cards */}
      {keywords.length === 0 ? (
        <div className="pulse-onboard">
          <div className="pulse-onboard-icon">◈</div>
          <div className="pulse-onboard-title">还没有监控关键词</div>
          <div className="pulse-onboard-sub">在上方输入你关注的亚马逊关键词，一键拉取搜索量、竞争指数、CPC 及趋势</div>
        </div>
      ) : (
        <div className="pulse-grid">
          {keywords.map((kw) => (
            <KeywordCard
              key={kw}
              keyword={kw}
              state={states[kw] ?? { kind: "idle" }}
              onRemove={() => removeKeyword(kw)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
