import { useEffect, useMemo, useState } from "react";
import SheetSelect from "../../components/SheetSelect";
import {
  patentSearchDesign,
  patentSearchInvention,
  patentStatus,
  type PatentLookupResponse,
} from "../../api/client";

const DESIGN_REGIONS = ["US", "GB", "EU", "CA", "AU", "DE", "FR", "IT", "ES", "JP", "CN", "KR", "MX", "BR"];

type PatentMode = "invention" | "design";
type QueryMode = "physical" | "line" | "hybrid";

export default function PatentLookupPanel() {
  const [mode, setMode] = useState<PatentMode>("invention");
  const [configured, setConfigured] = useState<boolean | null>(null);
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
    return Boolean(imageBase64 && regions.length > 0);
  }, [configured, description, imageBase64, loading, mode, regions.length, title]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("请上传图片文件");
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
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
    setLoading(true);
    try {
      const next =
        mode === "invention"
          ? await patentSearchInvention({
              product_title: title.trim(),
              product_description: description.trim(),
              top_number: topNumber,
            })
          : await patentSearchDesign({
              product_title: title.trim(),
              product_description: description.trim(),
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
    <div className="card" style={{ padding: 16, marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div className="ptitle" style={{ margin: 0 }}>/ 专利查询</div>
          <div style={{ color: "var(--t2)", fontSize: 12 }}>睿观 API · 发明专利 / 外观专利即时查询</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={mode === "invention" ? "tbtn primary" : "tbtn"} onClick={() => setMode("invention")}>发明专利</button>
          <button className={mode === "design" ? "tbtn primary" : "tbtn"} onClick={() => setMode("design")}>外观专利</button>
        </div>
      </div>

      {configured === false && (
        <div style={{ marginTop: 12, padding: 10, border: "1px solid var(--b)", borderRadius: 6, color: "var(--t2)" }}>
          未配置睿观 Token。请先到 <a href="/hub-settings">系统配置</a> 的数据源区域填写后再查询。
        </div>
      )}

      <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
        <input
          className="inp"
          value={title}
          maxLength={500}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={mode === "invention" ? "产品标题（发明专利必填）" : "产品标题（可选，用于辅助外观检索）"}
        />
        <textarea
          className="inp"
          value={description}
          maxLength={30000}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={mode === "invention" ? "产品描述（发明专利必填）" : "产品描述（可选）"}
          rows={mode === "invention" ? 5 : 3}
          style={{ resize: "vertical", minHeight: mode === "invention" ? 120 : 80 }}
        />

        {mode === "design" && (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <input
                className="inp"
                type="file"
                accept="image/*"
                onChange={(e) => onFile(e.target.files?.[0])}
                style={{ maxWidth: 280 }}
              />
              <SheetSelect
                className="inp"
                value={queryMode}
                onChange={(v) => setQueryMode(v as QueryMode)}
                title="图片检索模式"
                style={{ width: 130 }}
                options={[
                  { value: "hybrid", label: "混合" },
                  { value: "physical", label: "实物图" },
                  { value: "line", label: "线条图" },
                ]}
              />
              <label style={{ display: "inline-flex", gap: 6, alignItems: "center", color: "var(--t2)", fontSize: 12 }}>
                <input type="checkbox" checked={enableTro} onChange={(e) => setEnableTro(e.target.checked)} />
                TRO 增强
              </label>
              <label style={{ display: "inline-flex", gap: 6, alignItems: "center", color: "var(--t2)", fontSize: 12 }}>
                <input type="checkbox" checked={enableRadar} onChange={(e) => setEnableRadar(e.target.checked)} />
                雷达
              </label>
            </div>
            {imagePreview && (
              <img src={imagePreview} alt="产品图片预览" style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 6, border: "1px solid var(--b)" }} />
            )}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {DESIGN_REGIONS.map((region) => (
                <label key={region} style={{ display: "inline-flex", gap: 5, alignItems: "center", fontSize: 12, color: "var(--t2)" }}>
                  <input type="checkbox" checked={regions.includes(region)} onChange={() => toggleRegion(region)} />
                  {region}
                </label>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            className="inp"
            type="number"
            min={1}
            max={500}
            value={topNumber}
            onChange={(e) => setTopNumber(clampNumber(Number(e.target.value), 1, 500))}
            style={{ width: 110 }}
            title="返回数量"
          />
          <button className="tbtn primary" disabled={!canSubmit} onClick={runSearch}>
            {loading ? <><span className="spin" /> 查询中</> : "开始查询"}
          </button>
          <span style={{ color: "var(--t3)", fontSize: 11 }}>默认返回 50 条，最多 500 条</span>
        </div>
      </div>

      {error && <div style={{ marginTop: 12, color: "var(--danger, #d33)" }}>{error}</div>}
      {result && <PatentResult result={result} />}
    </div>
  );
}

function PatentResult({ result }: { result: PatentLookupResponse }) {
  return (
    <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
      <div style={{ color: "var(--t2)", fontSize: 12 }}>
        {result.patent_type === "invention" ? "发明专利" : "外观专利"} · {result.count} 条结果 · request_id:{" "}
        <code>{result.request_id || "-"}</code>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {(result.items || []).map((item, idx) => (
          <PatentCard key={`${item.global_patent_id || item.global_utility_id || item.publication_number || idx}`} item={item} />
        ))}
        {result.count === 0 && <div style={{ color: "var(--t2)" }}>未返回相似专利。</div>}
      </div>
    </div>
  );
}

function PatentCard({ item }: { item: any }) {
  const title = item.title || item.patent_prod || item.patent_prod_cn || item.title_cn || "未命名专利";
  const image = item.patent_image_url || item.images?.[0];
  const number = item.publication_number || item.application_number || item.global_patent_id || item.global_utility_id;
  const date = item.publication_date || item.application_date || item.estimated_due_date;
  const validity = item.patent_validity || item.patent_status;
  const region = item.region || item.country || item.patent_country;
  const abstract = item.patent_abstract || item.patent_abstract_cn || item.abstract || "";
  const similarity = typeof item.similarity === "number" ? `${Math.round(item.similarity * 1000) / 10}%` : item.similarity;

  return (
    <div style={{ border: "1px solid var(--b)", borderRadius: 6, padding: 12, display: "grid", gridTemplateColumns: image ? "96px minmax(0,1fr)" : "1fr", gap: 12 }}>
      {image && <img src={image} alt={title} style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 4, border: "1px solid var(--b)" }} />}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, marginBottom: 6, overflowWrap: "anywhere" }}>{title}</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", color: "var(--t2)", fontSize: 12 }}>
          {similarity && <span>相似度 {similarity}</span>}
          {region && <span>地区 {region}</span>}
          {validity && <span>状态 {validity}</span>}
          {number && <span style={{ fontFamily: "monospace" }}>{number}</span>}
          {date && <span>{date}</span>}
          {item.tro_holder && <span>TRO holder</span>}
          {item.tro_case && <span>TRO case</span>}
        </div>
        {abstract && <div style={{ marginTop: 8, color: "var(--t2)", fontSize: 12, lineHeight: 1.5, overflowWrap: "anywhere" }}>{abstract}</div>}
      </div>
    </div>
  );
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
