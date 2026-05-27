import { useCallback, useState } from "react";
import { api } from "../../api/client";

interface GeneratedSkill {
  name: string;
  category: string | null;
  frontmatter: Record<string, unknown>;
  body: string;
  preview: string;
}

const CATEGORIES = [
  "amazon",
  "amazon/listing",
  "amazon/ads",
  "research",
  "creative",
  "devops",
  "data-science",
  "productivity",
  "media",
  "software-development",
];

export default function IdeaSkill() {
  const [idea, setIdea] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [generated, setGenerated] = useState<GeneratedSkill | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const generate = useCallback(async () => {
    if (!idea.trim() || loading) return;
    setLoading(true);
    setError("");
    setGenerated(null);
    setSaved(false);
    try {
      const { data } = await api.post("/skill/generate-from-idea", {
        idea: idea.trim(),
        category: category || undefined,
      });
      setGenerated(data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || "生成失败");
    } finally {
      setLoading(false);
    }
  }, [idea, category, loading]);

  const save = useCallback(async () => {
    if (!generated || saving) return;
    setSaving(true);
    setError("");
    try {
      await api.post("/skill/item", {
        name: generated.category
          ? `${generated.category}/${generated.name}`
          : generated.name,
        description: generated.frontmatter?.description || "",
        body: generated.body,
        frontmatter_extras: generated.frontmatter,
      });
      setSaved(true);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  }, [generated, saving]);

  return (
    <div>
      <div className="ptitle">/ 想法工坊</div>
      <div style={{ fontSize: 10, color: "var(--t3)", marginBottom: 16 }}>
        一句话描述你的想法，AI 自动生成完整的 Skill
      </div>

      {/* Input area */}
      <div style={{ marginBottom: 14 }}>
        <textarea
          className="market-query-input"
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder="描述你想要的 Skill，例如：&#10;• 帮我自动分析竞品 Listing 的卖点差异&#10;• 根据关键词搜索量判断是否值得投放广告&#10;• 把中文售后邮件改写成专业的英文站内信"
          rows={4}
          disabled={loading}
          style={{ resize: "vertical", fontFamily: "inherit", width: "100%" }}
        />
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        <select
          className="market-query-input"
          style={{ flex: "0 0 160px" }}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">自动判断分类</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button
          className="market-btn market-btn-submit"
          onClick={generate}
          disabled={loading || !idea.trim()}
        >
          {loading ? (
            <><span className="spin" style={{ marginRight: 6 }} />生成中…</>
          ) : (
            "◇ 生成 Skill"
          )}
        </button>
      </div>

      {error && <div className="market-error">{error}</div>}

      {loading && !generated && (
        <div className="pulse-loading">
          <span className="pulse-spin">◌</span> AI 正在构思 Skill 结构（约 15 秒）…
        </div>
      )}

      {/* Preview */}
      {generated && (
        <div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>
              {String(generated.frontmatter?.icon || "⊞")} {generated.name}
            </span>
            {generated.category ? (
              <span className="tag">{generated.category}</span>
            ) : null}
          </div>

          {generated.frontmatter?.description_zh ? (
            <div style={{ fontSize: 11, color: "var(--t2)", marginBottom: 10 }}>
              {String(generated.frontmatter.description_zh)}
            </div>
          ) : null}

          {/* SKILL.md preview */}
          <div className="card" style={{ background: "var(--bg2)", marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: "var(--t3)", marginBottom: 6 }}>SKILL.md 预览</div>
            <pre style={{
              fontSize: 10,
              lineHeight: 1.6,
              maxHeight: 400,
              overflow: "auto",
              padding: 10,
              background: "var(--bg)",
              borderRadius: 4,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}>
              {generated.preview}
            </pre>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              className="market-btn market-btn-submit"
              onClick={save}
              disabled={saving || saved}
            >
              {saved ? "✓ 已保存" : saving ? "保存中…" : "💾 保存到 Skill 库"}
            </button>
            <button
              className="tbtn"
              onClick={() => { setGenerated(null); setSaved(false); }}
              style={{ fontSize: 11 }}
            >
              重新生成
            </button>
          </div>

          {saved && (
            <div style={{ marginTop: 10, fontSize: 11, color: "var(--green)" }}>
              ✓ Skill 已保存！可在「运营商店」中查看和执行，或在「Skill Studio」中编辑。
            </div>
          )}
        </div>
      )}
    </div>
  );
}
