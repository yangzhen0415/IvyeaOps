import { useState } from "react";
import { trafficDiagnosis } from "../../../api/deepAnalysis";

const MARKETPLACES = ["US", "UK", "DE", "CA", "JP", "FR", "ES", "IT", "MX", "AU"];

export default function TrafficDiagnosis() {
  const [asin, setAsin] = useState("");
  const [country, setCountry] = useState("US");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);

  const run = async () => {
    if (!asin.trim() || loading) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await trafficDiagnosis({ asin: asin.trim(), country });
      setResult(res.data);
    } catch (e: any) {
      setError(e?.message || "请求失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>⊘ 流量异动诊断</div>

      <div className="market-input-row" style={{ flexWrap: "wrap" }}>
        <input
          className="market-query-input"
          value={asin}
          onChange={(e) => setAsin(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="输入 ASIN，如 B0XXXXXXXX"
          disabled={loading}
        />
        <select className="market-query-input" style={{ flex: "1 1 80px", minWidth: 0 }} value={country} onChange={(e) => setCountry(e.target.value)}>
          {MARKETPLACES.map((m) => <option key={m}>{m}</option>)}
        </select>
        <button className="market-btn market-btn-submit" onClick={run} disabled={loading || !asin.trim()}>
          {loading ? "诊断中…" : "开始诊断"}
        </button>
      </div>

      {error && <div className="market-error" style={{ marginTop: 10 }}>{error}</div>}
      {loading && <div className="pulse-loading" style={{ marginTop: 10 }}><span className="pulse-spin">◌</span> 正在分析流量异动根因（约 30 秒）…</div>}

      {result && (
        <div style={{ marginTop: 14 }}>
          <div className="card" style={{ background: "var(--bg2)" }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>
              「{asin}」流量诊断报告
            </div>

            {/* Key findings */}
            {result.key_findings && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: "var(--t2)", marginBottom: 4 }}>核心发现</div>
                {Array.isArray(result.key_findings) ? result.key_findings.map((f: string, i: number) => (
                  <div key={i} style={{ fontSize: 10, padding: "4px 8px", background: "var(--bg3)", borderRadius: 4, marginBottom: 3, lineHeight: 1.5 }}>
                    {f}
                  </div>
                )) : (
                  <div style={{ fontSize: 10, lineHeight: 1.6, color: "var(--t2)" }}>{String(result.key_findings)}</div>
                )}
              </div>
            )}

            {/* Diagnosis */}
            {result.diagnosis && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: "var(--t2)", marginBottom: 4 }}>诊断结论</div>
                <div style={{ fontSize: 11, lineHeight: 1.6, color: "var(--t)" }}>{result.diagnosis}</div>
              </div>
            )}

            {/* Action items */}
            {result.recommendations && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: "var(--t2)", marginBottom: 4 }}>行动建议</div>
                {Array.isArray(result.recommendations) ? result.recommendations.map((r: string, i: number) => (
                  <div key={i} style={{ fontSize: 10, padding: "4px 8px", borderLeft: "2px solid var(--green)", marginBottom: 3, lineHeight: 1.5 }}>
                    {r}
                  </div>
                )) : (
                  <div style={{ fontSize: 10, lineHeight: 1.6 }}>{String(result.recommendations)}</div>
                )}
              </div>
            )}

            <details style={{ marginTop: 12 }}>
              <summary style={{ fontSize: 10, color: "var(--t3)", cursor: "pointer" }}>查看原始 JSON</summary>
              <pre style={{ fontSize: 9, maxHeight: 400, overflow: "auto", padding: 8, background: "var(--bg)", borderRadius: 4, marginTop: 4 }}>
                {JSON.stringify(result, null, 2)}
              </pre>
            </details>
          </div>
        </div>
      )}
    </div>
  );
}
