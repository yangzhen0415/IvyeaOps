import { useEffect, useRef, useState } from "react";
import { submitImage, imageStatus } from "../../api/assistant";

const SIZES = ["1024x1024", "1024x1536", "1536x1024"];

export default function ImageGen() {
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState(SIZES[0]);
  const [n, setN] = useState(1);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const run = async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true); setErr(""); setImages([]); setProgress(0);
    try {
      const taskId = await submitImage(prompt.trim(), size, n);
      const started = Date.now();
      timerRef.current = window.setInterval(async () => {
        try {
          const s = await imageStatus(taskId);
          setProgress(s.progress || 0);
          if (s.status === "completed") {
            clearInterval(timerRef.current!); timerRef.current = null;
            setImages(s.images); setLoading(false);
          } else if (s.status === "failed" || s.error) {
            clearInterval(timerRef.current!); timerRef.current = null;
            setErr(s.error || "生图失败"); setLoading(false);
          } else if (Date.now() - started > 180000) {
            clearInterval(timerRef.current!); timerRef.current = null;
            setErr("生图超时（>3分钟）"); setLoading(false);
          }
        } catch (e: any) {
          clearInterval(timerRef.current!); timerRef.current = null;
          setErr(e?.message || "查询失败"); setLoading(false);
        }
      }, 4000);
    } catch (e: any) {
      setErr(e?.message || "提交失败"); setLoading(false);
    }
  };

  const src = (u: string) => u;

  return (
    <div className="market-page">
      <div className="market-header">
        <span className="market-title"><span className="market-title-icon">▦</span> AI 生图</span>
      </div>

      <div className="market-input-row" style={{ flexWrap: "wrap" }}>
        <input
          className="market-query-input"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => e.key === "Enter" && run()}
          placeholder="描述你想要的图片，如：a sleek black trail camera on a tree, product photo, white background"
          disabled={loading}
        />
        <select className="market-query-input" style={{ flex: "0 0 120px" }} value={size} onChange={e => setSize(e.target.value)} disabled={loading}>
          {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="market-query-input" style={{ flex: "0 0 70px" }} value={n} onChange={e => setN(Number(e.target.value))} disabled={loading}>
          {[1, 2, 3, 4].map(x => <option key={x} value={x}>{x} 张</option>)}
        </select>
        <button className="market-btn market-btn-submit" onClick={run} disabled={loading || !prompt.trim()}>
          {loading ? <><span className="spin" style={{ marginRight: 6 }} />生成中…</> : "生成"}
        </button>
      </div>

      {err && <div className="market-error">{err}</div>}

      {loading && <div className="pulse-loading"><span className="pulse-spin">◌</span> 生成中（约 1 分钟）… {progress > 0 ? `${progress}%` : ""}</div>}

      {images.length > 0 && (
        <div className="imggen-grid">
          {images.map((u, i) => (
            <div key={i} className="imggen-card">
              <img src={src(u)} alt="" />
              <a className="tbtn" href={src(u)} target="_blank" rel="noreferrer">下载 / 查看</a>
            </div>
          ))}
        </div>
      )}

      {!loading && images.length === 0 && !err && (
        <div className="market-empty">
          <div className="market-empty-icon">▦</div>
          <div className="market-empty-title">输入提示词，用 AI 生成图片</div>
          <div className="market-empty-hint">Apimart gpt-image-2 · 英文提示词效果更佳</div>
        </div>
      )}
    </div>
  );
}
