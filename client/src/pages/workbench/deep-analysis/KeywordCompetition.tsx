import { useState } from "react";
import { keywordCompetition } from "../../../api/deepAnalysis";

const MARKETPLACES = ["US", "UK", "DE", "CA", "JP", "FR", "ES", "IT", "MX", "AU"];

export default function KeywordCompetition() {
  const [keyword, setKeyword] = useState("");
  const [country, setCountry] = useState("US");
  const [asin, setAsin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);

  const run = async () => {
    if (!keyword.trim() || loading) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await keywordCompetition({ keyword: keyword.trim(), country, asin: asin.trim() });
      setResult(res.data);
    } catch (e: any) {
      setError(e?.message || "请求失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>⊕ 关键词竞争分析</div>

      <div className="market-input-row" style={{ flexWrap: "wrap" }}>
        <input
          className="market-query-input"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="输入关键词，如: trail camera"
          disabled={loading}
        />
        <select
          className="market-query-input"
          style={{ flex: "1 1 80px", minWidth: 0 }}
          value={country}
          onChange={(e) => setCountry(e.target.value)}
        >
          {MARKETPLACES.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <input
          className="market-query-input"
          style={{ flex: "1 1 160px", minWidth: 0 }}
          value={asin}
          onChange={(e) => setAsin(e.target.value)}
          placeholder="对标 ASIN（可选）"
          disabled={loading}
        />
        <button className="market-btn market-btn-submit" onClick={run} disabled={loading || !keyword.trim()}>
          {loading ? "分析中…" : "开始分析"}
        </button>
      </div>

      {error && <div className="market-error" style={{ marginTop: 10 }}>{error}</div>}
      {loading && <div className="pulse-loading" style={{ marginTop: 10 }}><span className="pulse-spin">◌</span> 正在分析竞争格局…</div>}

      {result && (
        <div style={{ marginTop: 14 }}>
          <ResultDisplay data={result} keyword={keyword} />
        </div>
      )}
    </div>
  );
}

function ResultDisplay({ data, keyword }: { data: any; keyword: string }) {
  const topAsins = data?.top_asins || [];
  const systemState = data?.system_state || {};
  const demand = data?.demand_snapshot || {};
  const competition = data?.competition_position || "";

  return (
    <div className="card" style={{ background: "var(--bg2)" }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>
        「{keyword}」竞争格局分析
      </div>

      {/* System state table */}
      {systemState && Object.keys(systemState).length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: "var(--t2)", marginBottom: 6 }}>系统判断</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 10 }}>
            {Object.entries(systemState).map(([k, v]) => (
              <div key={k} style={{ padding: "4px 8px", background: "var(--bg3)", borderRadius: 4 }}>
                <span style={{ color: "var(--t3)" }}>{k}: </span>
                <span style={{ color: "var(--t)" }}>{String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Competition position */}
      {competition && (
        <div style={{ marginBottom: 12, fontSize: 11 }}>
          <span style={{ color: "var(--t3)" }}>竞争位置: </span>
          <span className="tag">{competition}</span>
        </div>
      )}

      {/* Demand snapshot */}
      {demand?.interpretation && (
        <div style={{ marginBottom: 12, fontSize: 10, color: "var(--t2)", lineHeight: 1.6 }}>
          {demand.interpretation}
        </div>
      )}

      {/* Top ASINs */}
      {topAsins.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: "var(--t2)", marginBottom: 6 }}>Top ASIN 流量份额</div>
          <div style={{ fontSize: 10, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--b)" }}>
                  <th style={{ textAlign: "left", padding: "4px 8px" }}>#</th>
                  <th style={{ textAlign: "left", padding: "4px 8px" }}>ASIN</th>
                  <th style={{ textAlign: "right", padding: "4px 8px" }}>自然</th>
                  <th style={{ textAlign: "right", padding: "4px 8px" }}>SP</th>
                  <th style={{ textAlign: "right", padding: "4px 8px" }}>品牌</th>
                  <th style={{ textAlign: "right", padding: "4px 8px" }}>视频</th>
                </tr>
              </thead>
              <tbody>
                {topAsins.slice(0, 10).map((a: any, i: number) => (
                  <tr key={a.asin} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: "4px 8px", color: "var(--t3)" }}>{i + 1}</td>
                    <td style={{ padding: "4px 8px", fontFamily: "monospace", fontSize: 10 }}>{a.asin}</td>
                    <td style={{ padding: "4px 8px", textAlign: "right" }}>{((a.natural_ratio || 0) * 100).toFixed(0)}%</td>
                    <td style={{ padding: "4px 8px", textAlign: "right" }}>{((a.sp_ratio || 0) * 100).toFixed(0)}%</td>
                    <td style={{ padding: "4px 8px", textAlign: "right" }}>{((a.brand_ratio || 0) * 100).toFixed(0)}%</td>
                    <td style={{ padding: "4px 8px", textAlign: "right" }}>{((a.video_ratio || 0) * 100).toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Raw JSON toggle */}
      <details style={{ marginTop: 12 }}>
        <summary style={{ fontSize: 10, color: "var(--t3)", cursor: "pointer" }}>查看原始 JSON</summary>
        <pre style={{ fontSize: 9, maxHeight: 300, overflow: "auto", padding: 8, background: "var(--bg)", borderRadius: 4, marginTop: 4 }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  );
}
