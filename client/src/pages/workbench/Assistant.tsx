import { useEffect, useRef, useState } from "react";
import { streamChat, type ChatMsg } from "../../api/assistant";
import { MarkdownReport } from "../../lib/reportFormat";

const STORAGE = "opshub-assistant-chat";

interface Turn { role: "user" | "assistant"; content: string }

export default function Assistant() {
  const [turns, setTurns] = useState<Turn[]>(() => {
    try { const r = localStorage.getItem(STORAGE); if (r) return JSON.parse(r); } catch {}
    return [];
  });
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [err, setErr] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => { try { localStorage.setItem(STORAGE, JSON.stringify(turns.slice(-40))); } catch {} }, [turns]);
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, [turns, streaming]);

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setErr("");
    const base: Turn[] = [...turns, { role: "user", content: text }];
    setTurns([...base, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const msgs: ChatMsg[] = [
      { role: "system", content: "你是亚马逊运营助手，用中文清晰作答；需要时用 Markdown（表格/列表/标题）写出可直接复制的文档。" },
      ...base.map(t => ({ role: t.role, content: t.content } as ChatMsg)),
    ];
    try {
      await streamChat(msgs, (e) => {
        if (e.type === "token") {
          setTurns(prev => {
            const n = [...prev];
            n[n.length - 1] = { role: "assistant", content: n[n.length - 1].content + e.text };
            return n;
          });
        } else if (e.type === "error") {
          setErr(e.detail);
        }
      }, ctrl.signal);
    } catch (e: any) {
      if (e?.name !== "AbortError") setErr(e?.message || "请求失败");
    } finally {
      setStreaming(false);
    }
  };

  const stop = () => { abortRef.current?.abort(); setStreaming(false); };
  const clear = () => { setTurns([]); setErr(""); };

  return (
    <div className="market-page">
      <div className="market-header">
        <span className="market-title"><span className="market-title-icon">✦</span> AI 写作 / 问答</span>
        <button className="tbtn" style={{ marginLeft: "auto" }} onClick={clear} disabled={streaming || turns.length === 0}>＋ 新对话</button>
      </div>

      <div ref={bodyRef} className="asst-body">
        {turns.length === 0 && (
          <div className="market-empty">
            <div className="market-empty-icon">✦</div>
            <div className="market-empty-title">问我任何问题，或让我帮你写文档/文案</div>
            <div className="market-empty-hint">纯文本 AI（DeepSeek / Apimart）· 支持 Markdown 文档输出</div>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={"asst-msg " + t.role}>
            <div className="asst-role">{t.role === "user" ? "我" : "AI"}</div>
            <div className="asst-content">
              {t.role === "assistant"
                ? (t.content ? <MarkdownReport text={t.content} /> : <span className="cursor-blink">▋</span>)
                : <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{t.content}</div>}
            </div>
          </div>
        ))}
      </div>

      {err && <div className="market-error">{err}</div>}

      <div className="market-input-row">
        <textarea
          className="market-query-input"
          style={{ resize: "none", height: 44, paddingTop: 10 }}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="输入问题或写作要求，Enter 发送（Shift+Enter 换行）"
          disabled={streaming}
        />
        {streaming
          ? <button className="market-btn market-btn-stop" onClick={stop}>停止</button>
          : <button className="market-btn market-btn-submit" onClick={send} disabled={!input.trim()}>发送</button>}
      </div>
    </div>
  );
}
