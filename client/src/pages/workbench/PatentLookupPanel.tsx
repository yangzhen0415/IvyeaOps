import { useEffect, useMemo, useState } from "react";
import SheetSelect from "../../components/SheetSelect";
import {
  patentSearchDesign,
  patentSearchInvention,
  patentStatus,
  type PatentLookupResponse,
} from "../../api/client";

const DESIGN_REGIONS = ["US", "GB", "EU", "CA", "AU", "DE", "FR", "IT", "ES", "JP", "CN", "KR", "MX", "BR"];
const EXAMPLE_KEYWORDS = ["air fryer", "wireless earbuds", "yoga mat", "desk lamp"];

type PatentMode = "design" | "invention";
type QueryMode = "physical" | "line" | "hybrid";

type PatentLookupPanelProps = {
  standalone?: boolean;
};

export default function PatentLookupPanel({ standalone = false }: PatentLookupPanelProps) {
  const [mode, setMode] = useState<PatentMode>("design");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [keyword, setKeyword] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [topNumber, setTopNumber] = useState(50);
  const [regions, setRegions] = useState<string[]>(["US"]);
  const [imageBase64, setImageBase64] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [enableTro, setEnableTro] = useState(true);
  const [enableRadar, setEnableRadar] = useState(false);
  const [queryMode, setQueryMode] = useState<QueryMode>("hybrid");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PatentLookupResponse | null>(null);

  useEffect(() => {
    patentStatus()
      .then((r) => setConfigured(r.configured))
      .catch(() => setConfigured(false));
  }, []);

  const canSubmit = useMemo(() => {
    if (!configured || loading) return false;
    if (mode === "invention") return Boolean(title.trim() && description.trim());
    return Boolean(imageBase64 && keyword.trim() && regions.length > 0);
  }, [configured, description, imageBase64, keyword, loading, mode, regions.length, title]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("请上传图片文件");
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    setError("");
    setImagePreview(dataUrl);
    setImageBase64(dataUrl);
  };

  const toggleRegion = (region: string) => {
    setRegions((prev) => {
      if (prev.includes(region)) return prev.filter((x) => x !== region);
      return [...prev, region];
    });
  };

  const runSearch = async () => {
    setError("");
    setResult(null);
    if (!configured) {
      setError("请先在系统配置中填写睿观 Token");
      return;
    }
    if (mode === "invention" && (!title.trim() || !description.trim())) {
      setError("发明专利查询需要产品标题和产品描述");
      return;
    }
    if (mode === "design" && !imageBase64) {
      setError("外观专利查询需要上传一张产品图片");
      return;
    }
    if (mode === "design" && !keyword.trim()) {
      setError("外观专利查询需要输入关键词，便于睿观匹配产品语义");
      return;
    }
    setLoading(true);
    try {
      const next =
        mode === "invention"
          ? await patentSearchInvention({
              product_title: title.trim(),
              product_description: withKeyword(description.trim(), keyword.trim()),
              top_number: topNumber,
            })
          : await patentSearchDesign({
              product_title: title.trim() || keyword.trim(),
              product_description: withKeyword(description.trim(), keyword.trim()),
              regions,
              image_base64: imageBase64,
              top_number: topNumber,
              enable_tro: enableTro,
              enable_radar: enableRadar,
              query_mode: queryMode,
            });
      setResult(next);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || "查询失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={standalone ? "patent-page" : "patent-page patent-page-embedded"}>
      {standalone && (
        <section className="modern-hero compact">
          <div className="hero-kicker">RUIGUAN PATENT LOOKUP</div>
          <h1>睿观查专利</h1>
          <p>上传产品图，输入关键词或产品信息，调用睿观 API 返回发明专利 / 外观专利相似结果。</p>
        </section>
      )}

      {!standalone && (
        <div className="patent-section-title">
          <div>
            <div className="ptitle" style={{ margin: 0 }}>/ 睿观查专利</div>
            <p>上传产品图 + 输入关键词，快速检查相似外观专利；也支持发明专利文本检索。</p>
          </div>
          <a className="tbtn" href="/patent-lookup">打开独立页面</a>
        </div>
      )}

      <div className="patent-shell">
        <section className="patent-card patent-query-card">
          <div className="patent-card-head">
            <div>
              <span className="patent-chip">睿观 API</span>
              <h2>查询条件</h2>
            </div>
            <div className="patent-mode-switch">
              <button className={mode === "design" ? "active" : ""} onClick={() => setMode("design")}>外观专利</button>
              <button className={mode === "invention" ? "active" : ""} onClick={() => setMode("invention")}>发明专利</button>
            </div>
          </div>

          {configured === false && (
            <div className="patent-alert">
              未配置睿观 Token。请先到 <a href="/hub-settings">系统配置</a> 的数据源区域填写后再查询。
            </div>
          )}

          <div className="patent-form-grid">
            <label className="field-block wide">
              <span>{mode === "design" ? "检索关键词" : "关键词 / 辅助语义"}</span>
              <input
                className="inp"
                value={keyword}
                maxLength={200}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="例如：air fryer / shoe rack / silicone case"
              />
            </label>

            <label className="field-block">
              <span>产品标题{mode === "invention" ? " *" : ""}</span>
              <input
                className="inp"
                value={title}
                maxLength={500}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={mode === "invention" ? "发明专利必填" : "可选，不填则使用关键词"}
              />
            </label>

            <label className="field-block">
              <span>返回数量</span>
              <input
                className="inp"
                type="number"
                min={1}
                max={500}
                value={topNumber}
                onChange={(e) => setTopNumber(clampNumber(Number(e.target.value), 1, 500))}
              />
            </label>

            <label className="field-block wide">
              <span>产品描述{mode === "invention" ? " *" : ""}</span>
              <textarea
                className="inp"
                value={description}
                maxLength={30000}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={mode === "invention" ? "产品结构、用途、技术方案、差异点" : "可选：补充产品材质、用途、结构、应用场景"}
                rows={mode === "invention" ? 6 : 4}
              />
            </label>
          </div>

          {mode === "design" && (
            <div className="patent-design-options">
              <div className="patent-toolbar">
                <SheetSelect
                  className="inp"
                  value={queryMode}
                  onChange={(v) => setQueryMode(v as QueryMode)}
                  title="图片检索模式"
                  style={{ minWidth: 138 }}
                  options={[
                    { value: "hybrid", label: "混合检索" },
                    { value: "physical", label: "实物图" },
                    { value: "line", label: "线条图" },
                  ]}
                />
                <label className="toggle-line">
                  <input type="checkbox" checked={enableTro} onChange={(e) => setEnableTro(e.target.checked)} />
                  TRO 增强
                </label>
                <label className="toggle-line">
                  <input type="checkbox" checked={enableRadar} onChange={(e) => setEnableRadar(e.target.checked)} />
                  雷达
                </label>
              </div>

              <div className="region-grid">
                {DESIGN_REGIONS.map((region) => (
                  <button
                    type="button"
                    key={region}
                    className={regions.includes(region) ? "region-pill active" : "region-pill"}
                    onClick={() => toggleRegion(region)}
                  >
                    {region}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="patent-examples">
            {EXAMPLE_KEYWORDS.map((item) => (
              <button key={item} type="button" onClick={() => setKeyword(item)}>{item}</button>
            ))}
          </div>

          <div className="patent-actions">
            <button className="tbtn primary patent-run-btn" disabled={!canSubmit} onClick={runSearch}>
              {loading ? <><span className="spin" /> 查询中...</> : "开始查询"}
            </button>
            <span>{mode === "design" ? "外观专利需上传 1 张产品图，并至少选择 1 个国家/地区。" : "发明专利需标题和描述。"}</span>
          </div>

          {error && <div className="patent-error">{error}</div>}
        </section>

        <aside className="patent-card patent-side-card">
          <h2>图片与状态</h2>
          {mode === "design" ? (
            <ImageDropzone preview={imagePreview} onFile={onFile} onClear={() => { setImagePreview(""); setImageBase64(""); }} />
          ) : (
            <div className="patent-text-preview">
              <div>发明专利查询不需要图片。</div>
              <p>建议填写产品结构、功能原理、使用方式和区别点，结果会更稳定。</p>
            </div>
          )}
          <div className="patent-status-list">
            <StatusRow label="Token" value={configured ? "已配置" : configured === false ? "未配置" : "检测中"} ok={configured === true} />
            <StatusRow label="关键词" value={keyword.trim() ? "已填写" : "待填写"} ok={Boolean(keyword.trim())} />
            <StatusRow label="图片" value={imageBase64 ? "已上传" : mode === "design" ? "待上传" : "不需要"} ok={mode !== "design" || Boolean(imageBase64)} />
            <StatusRow label="地区" value={regions.join(", ")} ok={regions.length > 0} />
          </div>
        </aside>
      </div>

      {result && <PatentResult result={result} />}
    </div>
  );
}

function ImageDropzone({ preview, onFile, onClear }: { preview: string; onFile: (file?: File) => void; onClear: () => void }) {
  return (
    <div
      className={preview ? "patent-dropzone has-image" : "patent-dropzone"}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onFile(e.dataTransfer.files?.[0]);
      }}
    >
      {preview ? (
        <>
          <img src={preview} alt="上传图片预览" />
          <button type="button" onClick={onClear}>移除图片</button>
        </>
      ) : (
        <>
          <div className="drop-icon">▧</div>
          <strong>上传产品图</strong>
          <p>拖拽图片到这里，或点击选择本地图片。建议使用白底图、场景图或产品正面图。</p>
          <label className="tbtn">
            选择图片
            <input type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0])} hidden />
          </label>
        </>
      )}
    </div>
  );
}

function PatentResult({ result }: { result: PatentLookupResponse }) {
  return (
    <section className="patent-card patent-result-card">
      <div className="patent-result-head">
        <div>
          <span className="patent-chip">{result.patent_type === "invention" ? "发明专利" : "外观专利"}</span>
          <h2>查询结果</h2>
          <p>{result.count} 条结果 · request_id: <code>{result.request_id || "-"}</code></p>
        </div>
        <span className={result.success ? "status-badge ok" : "status-badge danger"}>{result.success ? "查询成功" : "接口返回异常"}</span>
      </div>

      <div className="patent-result-grid">
        {(result.items || []).map((item, idx) => (
          <PatentCard key={`${item.global_patent_id || item.global_utility_id || item.publication_number || idx}`} item={item} />
        ))}
        {result.count === 0 && <div className="patent-empty">未返回相似专利。可以换一张更清晰的产品图，或增加关键词/描述再查。</div>}
      </div>

      <details className="patent-raw">
        <summary>查看原始返回</summary>
        <pre>{JSON.stringify(result.data || result, null, 2)}</pre>
      </details>
    </section>
  );
}

function PatentCard({ item }: { item: any }) {
  const title = item.title || item.patent_prod || item.patent_prod_cn || item.title_cn || item.name || "未命名专利";
  const image = pickImage(item);
  const number = item.publication_number || item.application_number || item.global_patent_id || item.global_utility_id || item.patent_no;
  const date = item.publication_date || item.application_date || item.estimated_due_date || item.apply_date;
  const validity = item.patent_validity || item.patent_status || item.status;
  const region = item.region || item.country || item.patent_country || item.country_code;
  const abstract = item.patent_abstract || item.patent_abstract_cn || item.abstract || item.desc || "";
  const similarity = normalizeSimilarity(item.similarity ?? item.score ?? item.similar_score);
  const owner = item.applicant || item.assignee || item.owner || item.patentee;
  const url = item.url || item.patent_url || item.detail_url;

  return (
    <article className="patent-result-item">
      {image && <img className="patent-thumb" src={image} alt={title} />}
      <div className="patent-item-body">
        <h3>{title}</h3>
        <div className="patent-meta">
          {similarity && <span>相似度 {similarity}</span>}
          {region && <span>地区 {region}</span>}
          {validity && <span>状态 {validity}</span>}
          {number && <span className="mono">{number}</span>}
          {date && <span>{date}</span>}
          {item.tro_holder && <span>TRO holder</span>}
          {item.tro_case && <span>TRO case</span>}
        </div>
        {owner && <div className="patent-owner">权利人：{owner}</div>}
        {abstract && <p>{abstract}</p>}
        <div className="patent-card-footer">
          {url && <a href={url} target="_blank" rel="noreferrer">打开详情</a>}
          <details>
            <summary>字段</summary>
            <pre>{JSON.stringify(item, null, 2)}</pre>
          </details>
        </div>
      </div>
    </article>
  );
}

function StatusRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="patent-status-row">
      <span>{label}</span>
      <strong className={ok ? "ok" : ""}>{value}</strong>
    </div>
  );
}

function pickImage(item: any) {
  const candidates = [
    item.patent_image_url,
    item.image_url,
    item.thumbnail,
    item.img,
    Array.isArray(item.images) ? item.images[0] : undefined,
    Array.isArray(item.image_urls) ? item.image_urls[0] : undefined,
  ].filter(Boolean);
  return candidates[0] || "";
}

function normalizeSimilarity(value: any) {
  if (value === undefined || value === null || value === "") return "";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  if (numeric <= 1) return `${Math.round(numeric * 1000) / 10}%`;
  return `${Math.round(numeric * 10) / 10}%`;
}

function withKeyword(text: string, keyword: string) {
  if (!keyword) return text;
  if (!text) return `检索关键词：${keyword}`;
  return `${text}\n\n检索关键词：${keyword}`;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
