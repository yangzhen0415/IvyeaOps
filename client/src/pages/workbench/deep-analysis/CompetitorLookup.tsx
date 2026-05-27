import { useState } from "react";
import { competitorLookup } from "../../../api/deepAnalysis";

const MARKETPLACES = ["US", "UK", "DE", "CA", "JP", "FR", "ES", "IT", "MX", "AU"];
const TIME_TYPES = [
  { value: "lately", label: "近N天" },
  { value: "week", label: "指定周" },
  { value: "month", label: "指定月" },
];

export default function CompetitorLookup() {
  const [asin, setAsin] = useState("");
  const [country, setCountry] = useState("US");
  const [timeType, setTimeType] = useState("lately");
  const [timeValue, setTimeValue] = useState("7");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);

  const run = async () => {
    if (!asin.trim() || loading) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await competitorLookup({ asin: asin.trim(), country, time_type: timeType, time_value: timeValue });
      setResult(res.data);
    } catch (e: any) {
      setError(e?.message || "请求失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>⊗ 竞品反查</div>

      <div className="market-input-row" style={{ flexWrap: "wrap" }}>
        <input
          className="market-query-input"
          value={asin}
          onChange={(e) => setAsin(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="输入竞品 ASIN"
          disabled={loading}
        />
        <select className="market-query-input" style={{ flex: "1 1 80px", minWidth: 0 }} value={country} onChange={(e) => setCountry(e.target.value)}>
          {MARKETPLACES.map((m) => <option key={m}>{m}</option>)}
        </select>
        <select className="market-query-input" style={{ flex: "1 1 90px", minWidth: 0 }} value={timeType} onChange={(e) => setTimeType(e.target.value)}>
          {TIME_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <input
          className="market-query-input"
          style={{ flex: "1 1 60px", minWidth: 0 }}
          value={timeValue}
          onChange={(e) => setTimeValue(e.target.value)}
          placeholder="7"
        />
        <button className="market-btn market-btn-submit" onClick={run} disabled={loading || !asin.trim()}>
          {loading ? "反查中…" : "开始反查"}
        </button>
      </div>

      {error && <div className="market-error" style={{ marginTop: 10 }}>{error}</div>}
      {loading && <div className="pulse-loading" style={{ marginTop: 10 }}><span className="pulse-spin">◌</span> 正在反查竞品关键词…</div>}

      {result && (
        <div style={{ marginTop: 14 }}>
          <div className="card" style={{ background: "var(--bg2)" }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>
              「{asin}」关键词信号分析
            </div>

            {/* Primary signals */}
            {result.primary_signals && (
              <div style={{ marginBottom: 12 }}>
                {result.primary_signals.declining?.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10, color: "#ef4444", marginBottom: 4 }}>↓ 下降关键词</div>
                    {result.primary_signals.declining.map((kw: any, i: number) => (
                      <div key={i} style={{ fontSize: 10, padding: "4px 8px", background: "var(--bg3)", borderRadius: 4, marginBottom: 3 }}>
                        <span style={{ fontFamily: "monospace" }}>{kw.keyword}</span>
                        {kw.contri_change != null && <span style={{ color: "#ef4444", marginLeft: 8 }}>{(kw.contri_change * 100).toFixed(1)}%</span>}
                      </div>
                    ))}
                  </div>
                )}
                {result.primary_signals.gaining?.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10, color: "#22c55e", marginBottom: 4 }}>↑ 上升关键词</div>
                    {result.primary_signals.gaining.map((kw: any, i: number) => (
                      <div key={i} style={{ fontSize: 10, padding: "4px 8px", background: "var(--bg3)", borderRadius: 4, marginBottom: 3 }}>
                        <span style={{ fontFamily: "monospace" }}>{kw.keyword}</span>
                        {kw.contri_change != null && <span style={{ color: "#22c55e", marginLeft: 8 }}>+{(kw.contri_change * 100).toFixed(1)}%</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Top keywords table */}
            {result.top_keywords?.length > 0 && (
              <div>
                <div style={{ fontSize: 10, color: "var(--t2)", marginBottom: 6 }}>Top 关键词（按流量份额）</div>
                <div style={{ fontSize: 10, overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--b)" }}>
                        <th style={{ textAlign: "left", padding: "4px 6px" }}>关键词</th>
                        <th style={{ textAlign: "left", padding: "4px 6px" }}>健康</th>
                        <th style={{ textAlign: "left", padding: "4px 6px" }}>排名趋势</th>
                        <th style={{ textAlign: "right", padding: "4px 6px" }}>点击份额</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.top_keywords.slice(0, 20).map((kw: any, i: number) => (
                        <tr key={i} style={{ borderBottom: "1px solid var(--line)" }}>
                          <td style={{ padding: "4px 6px", fontFamily: "monospace" }}>{kw.keyword}</td>
                          <td style={{ padding: "4px 6px" }}>
                            <span className="tag" style={{ fontSize: 8 }}>{kw.keyword_health}</span>
                          </td>
                          <td style={{ padding: "4px 6px", color: kw.rank_evolution === "declining" ? "#ef4444" : kw.rank_evolution === "improving" ? "#22c55e" : "var(--t3)" }}>
                            {kw.rank_evolution}
                          </td>
                          <td style={{ padding: "4px 6px", textAlign: "right" }}>{((kw.click_share || 0) * 100).toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <details style={{ marginTop: 12 }}>
              <summary style={{ fontSize: 10, color: "var(--t3)", cursor: "pointer" }}>查看原始 JSON</summary>
              <pre style={{ fontSize: 9, maxHeight: 300, overflow: "auto", padding: 8, background: "var(--bg)", borderRadius: 4, marginTop: 4 }}>
                {JSON.stringify(result, null, 2)}
              </pre>
            </details>
          </div>
        </div>
      )}
    </div>
  );
}
