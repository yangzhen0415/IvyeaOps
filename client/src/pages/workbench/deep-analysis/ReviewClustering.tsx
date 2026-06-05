import { useCallback, useRef, useState } from "react";
import { streamReviews, type SseEvent } from "../../../api/deepAnalysis";
import AnalysisSkeleton from "./AnalysisSkeleton";
import SheetSelect from "../../../components/SheetSelect";
import { marketplaceOptions } from "../../../lib/marketplaces";

const MARKETPLACES = ["US", "UK", "DE", "CA", "JP"];

export default function ReviewClustering() {
  const [asin, setAsin] = useState("");
  const [country, setCountry] = useState("US");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [output, setOutput] = useState("");
  const [provider, setProvider] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    if (!asin.trim() || loading) return;
    setLoading(true);
    setError("");
    setOutput("");
    setProvider("");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await streamReviews(
        { asin: asin.trim(), country },
        (evt: SseEvent) => {
          if (evt.type === "token") {
            setOutput((prev) => prev + evt.text);
            setProvider(evt.provider);
          } else if (evt.type === "error") {
            setError(evt.detail);
          }
        },
        ctrl.signal,
      );
    } catch (e: any) {
      if (e.name !== "AbortError") setError(e?.message || "请求失败");
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [asin, country, loading]);

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>⊙ 评论聚类分析</div>

      <div className="market-input-row" style={{ flexWrap: "wrap" }}>
        <input
          className="market-query-input"
          value={asin}
          onChange={(e) => setAsin(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="输入 ASIN"
          disabled={loading}
        />
        <SheetSelect className="market-query-input" style={{ flex: "1 1 80px", minWidth: 0 }} value={country} onChange={setCountry}
          flags title="选择国家" options={marketplaceOptions(MARKETPLACES)} />
        <button className="market-btn market-btn-submit" onClick={run} disabled={loading || !asin.trim()}>
          {loading ? "分析中…" : "开始分析"}
        </button>
        {loading && (
          <button className="tbtn" onClick={() => abortRef.current?.abort()} style={{ fontSize: 10 }}>
            停止
          </button>
        )}
      </div>

      {error && <div className="market-error" style={{ marginTop: 10 }}>{error}</div>}
      {loading && !output && <AnalysisSkeleton label="正在采集评论并聚类分析（约 1-2 分钟）…" sections={4} />}

      {output && (
        <div className="wb-enter" style={{ marginTop: 14 }}>
          {provider && <div style={{ fontSize: 9, color: "var(--t3)", marginBottom: 4 }}>via {provider}</div>}
          <div
            className="card"
            style={{ background: "var(--bg2)", fontSize: 11, lineHeight: 1.7, whiteSpace: "pre-wrap" }}
            dangerouslySetInnerHTML={{ __html: simpleMarkdown(output) }}
          />
        </div>
      )}
    </div>
  );
}

/** Minimal markdown → HTML for streaming display */
function simpleMarkdown(md: string): string {
  return md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, '<div style="font-size:13px;font-weight:700;margin:10px 0 4px">$1</div>')
    .replace(/^## (.+)$/gm, '<div style="font-size:14px;font-weight:700;margin:12px 0 6px">$1</div>')
    .replace(/^# (.+)$/gm, '<div style="font-size:15px;font-weight:700;margin:14px 0 8px">$1</div>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, '<code style="background:var(--bg3);padding:1px 4px;border-radius:2px;font-size:10px">$1</code>')
    .replace(/\n/g, "<br>");
}
