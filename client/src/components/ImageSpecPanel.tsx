import { useMemo } from "react";

export type ImageFormat = "png" | "jpeg" | "webp";
export type SizeMode = "auto" | "ratio" | "manual";
export type ResolutionTier = "auto" | "1k" | "2k" | "4k";
export type ImageSpecVariant = "general" | "aplus";

export interface ImageSpec {
  count: number;
  sizeMode: SizeMode;
  resolutionTier: ResolutionTier;
  ratio: string;
  width: number;
  height: number;
  format: ImageFormat;
  quality: number;
}

export const DEFAULT_IMAGE_SPEC: ImageSpec = {
  count: 1,
  sizeMode: "auto",
  resolutionTier: "1k",
  ratio: "1:1",
  width: 1024,
  height: 1024,
  format: "png",
  quality: 92,
};

export const GENERAL_RATIO_PRESETS = [
  { value: "1:1", label: "1:1 正方形", w: 1, h: 1 },
  { value: "3:2", label: "3:2 横版", w: 3, h: 2 },
  { value: "2:3", label: "2:3 竖版", w: 2, h: 3 },
  { value: "16:9", label: "16:9 横版", w: 16, h: 9 },
  { value: "21:9", label: "21:9 超宽横版", w: 21, h: 9 },
  { value: "4:3", label: "4:3 横版", w: 4, h: 3 },
  { value: "3:4", label: "3:4 竖版", w: 3, h: 4 },
] as const;

export const APLUS_RATIO_PRESETS = [
  ...GENERAL_RATIO_PRESETS,
  { value: "aplus-desktop", label: "A+ 桌面 1464x600", fixed: "1464x600" },
  { value: "aplus-mobile", label: "A+ 移动 600x450", fixed: "600x450" },
] as const;

export const RATIO_PRESETS = GENERAL_RATIO_PRESETS;

function ratioPresetsForVariant(variant: ImageSpecVariant = "general") {
  return variant === "aplus" ? APLUS_RATIO_PRESETS : GENERAL_RATIO_PRESETS;
}

const TIER_SQUARE: Record<ResolutionTier, number> = {
  auto: 1024,
  "1k": 1024,
  "2k": 2048,
  "4k": 2880,
};

const TIER_LONG_EDGE: Record<ResolutionTier, number> = {
  auto: 1024,
  "1k": 1024,
  "2k": 2048,
  "4k": 3840,
};

function cleanNumber(value: unknown, fallback: number) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(256, Math.min(4096, n));
}

function even(n: number) {
  return Math.max(256, Math.round(n / 2) * 2);
}

function parseSize(size?: string) {
  const m = String(size || "").match(/^(\d{3,5})x(\d{3,5})$/i);
  if (!m) return null;
  return { width: cleanNumber(m[1], 1024), height: cleanNumber(m[2], 1024) };
}

export function specFromSize(size?: string): ImageSpec {
  const parsed = parseSize(size);
  return {
    ...DEFAULT_IMAGE_SPEC,
    sizeMode: parsed ? "manual" : DEFAULT_IMAGE_SPEC.sizeMode,
    width: parsed?.width || DEFAULT_IMAGE_SPEC.width,
    height: parsed?.height || DEFAULT_IMAGE_SPEC.height,
  };
}

export function normalizeImageSpec(input?: Partial<ImageSpec>, fallbackSize?: string, variant: ImageSpecVariant = "general"): ImageSpec {
  const fallback = specFromSize(fallbackSize);
  const next = { ...fallback, ...(input || {}) };
  const ratioPresets = ratioPresetsForVariant(variant);
  return {
    count: Math.max(1, Math.min(10, Math.round(Number(next.count) || 1))),
    sizeMode: ["auto", "ratio", "manual"].includes(next.sizeMode) ? next.sizeMode : "auto",
    resolutionTier: ["auto", "1k", "2k", "4k"].includes(next.resolutionTier) ? next.resolutionTier : "1k",
    ratio: ratioPresets.some((r) => r.value === next.ratio) ? next.ratio : "1:1",
    width: cleanNumber(next.width, fallback.width),
    height: cleanNumber(next.height, fallback.height),
    format: ["png", "jpeg", "webp"].includes(next.format) ? next.format : "png",
    quality: Math.max(40, Math.min(100, Math.round(Number(next.quality) || 92))),
  };
}

export function computeImageSize(input: Partial<ImageSpec> | undefined, fallbackSize = "1024x1024", variant: ImageSpecVariant = "general") {
  const spec = normalizeImageSpec(input, fallbackSize, variant);
  const fallback = parseSize(fallbackSize) || { width: 1024, height: 1024 };

  if (spec.sizeMode === "manual") {
    return `${cleanNumber(spec.width, fallback.width)}x${cleanNumber(spec.height, fallback.height)}`;
  }

  if (spec.sizeMode === "auto") {
    if (spec.resolutionTier === "auto") return `${fallback.width}x${fallback.height}`;
    const side = TIER_SQUARE[spec.resolutionTier];
    return `${side}x${side}`;
  }

  const ratioPresets = ratioPresetsForVariant(variant);
  const ratio = ratioPresets.find((r) => r.value === spec.ratio) || GENERAL_RATIO_PRESETS[0];
  if ("fixed" in ratio && ratio.fixed) return ratio.fixed;

  const w = "w" in ratio ? ratio.w : 1;
  const h = "h" in ratio ? ratio.h : 1;
  if (w === h) {
    const side = TIER_SQUARE[spec.resolutionTier];
    return `${side}x${side}`;
  }

  const long = TIER_LONG_EDGE[spec.resolutionTier];
  if (w > h) return `${long}x${even((long * h) / w)}`;
  return `${even((long * w) / h)}x${long}`;
}

export function formatExtension(format: ImageFormat) {
  return format === "jpeg" ? "jpg" : format;
}

export async function downloadImageAs(url: string, fileName: string, input?: Partial<ImageSpec>) {
  const spec = normalizeImageSpec(input);
  const ext = formatExtension(spec.format);
  const mime = spec.format === "jpeg" ? "image/jpeg" : `image/${spec.format}`;
  const safeName = fileName.replace(/[\\/:*?"<>|]+/g, "-");

  try {
    const resp = await fetch(url, { credentials: "include" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.drawImage(bitmap, 0, 0);
    const converted = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, mime, spec.format === "jpeg" ? spec.quality / 100 : undefined);
    });
    if (!converted) throw new Error("Conversion failed");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(converted);
    a.download = `${safeName}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noreferrer";
    a.download = `${safeName}.${ext}`;
    a.click();
  }
}

interface ImageSpecPanelProps {
  value?: Partial<ImageSpec>;
  onChange: (next: ImageSpec) => void;
  fallbackSize?: string;
  compact?: boolean;
  maxCount?: number;
  title?: string;
  variant?: ImageSpecVariant;
}

export default function ImageSpecPanel({
  value,
  onChange,
  fallbackSize = "1024x1024",
  compact = false,
  maxCount = 10,
  title = "图片规格",
  variant = "general",
}: ImageSpecPanelProps) {
  const spec = normalizeImageSpec(value, fallbackSize, variant);
  const ratioPresets = ratioPresetsForVariant(variant);
  const computedSize = useMemo(() => computeImageSize(spec, fallbackSize, variant), [spec, fallbackSize, variant]);
  const countMax = Math.max(1, Math.min(10, Math.round(Number(maxCount) || 10)));
  const displayCount = Math.max(1, Math.min(countMax, spec.count));
  const patch = (partial: Partial<ImageSpec>) => onChange(normalizeImageSpec({ ...spec, ...partial }, fallbackSize, variant));

  return (
    <div className={`image-spec-panel ${compact ? "compact" : ""}`}>
      <div className="isp-head">
        <div>
          <div className="isp-title">{title}</div>
          <div className="isp-sub">比例、分辨率和格式会随当前任务保存</div>
        </div>
        <span className="isp-pill">{computedSize}</span>
      </div>

      <div className="isp-row two">
        <label className="isp-count-field">
          <span className="isp-count-head">
            <span>张数</span>
            <strong>{displayCount} 张</strong>
          </span>
          <input
            className="isp-range"
            type="range"
            min={1}
            max={countMax}
            step={1}
            value={displayCount}
            onChange={(e) => patch({ count: Number(e.target.value) })}
          />
        </label>
        <label>
          <span>分辨率</span>
          <select value={spec.resolutionTier} onChange={(e) => patch({ resolutionTier: e.target.value as ResolutionTier })}>
            <option value="auto">Auto</option>
            <option value="1k">1K</option>
            <option value="2k">2K</option>
            <option value="4k">4K</option>
          </select>
        </label>
      </div>

      <div className="isp-segment" role="group" aria-label="尺寸模式">
        {[
          ["auto", "Auto"],
          ["ratio", "按比例"],
          ["manual", "手动宽高"],
        ].map(([valueKey, label]) => (
          <button
            key={valueKey}
            type="button"
            className={spec.sizeMode === valueKey ? "active" : ""}
            onClick={() => patch({ sizeMode: valueKey as SizeMode })}
          >
            {label}
          </button>
        ))}
      </div>

      {spec.sizeMode === "ratio" && (
        <label className="isp-field">
          <span>比例</span>
          <select value={spec.ratio} onChange={(e) => patch({ ratio: e.target.value })}>
            {ratioPresets.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>
      )}

      {spec.sizeMode === "manual" && (
        <div className="isp-row manual">
          <label>
            <span>宽</span>
            <input type="number" min={256} max={4096} step={2} value={spec.width} onChange={(e) => patch({ width: Number(e.target.value) })} />
          </label>
          <span className="isp-times">x</span>
          <label>
            <span>高</span>
            <input type="number" min={256} max={4096} step={2} value={spec.height} onChange={(e) => patch({ height: Number(e.target.value) })} />
          </label>
        </div>
      )}

      <div className="isp-computed">
        <span>计算后分辨率</span>
        <strong>{computedSize}</strong>
      </div>
      {spec.resolutionTier === "4k" && (
        <div className="isp-warn">高分辨率会提高生成时间；如果模型不支持，可能按服务商能力降级。</div>
      )}

      <div className="isp-row two">
        <label>
          <span>格式</span>
          <select value={spec.format} onChange={(e) => patch({ format: e.target.value as ImageFormat })}>
            <option value="png">PNG</option>
            <option value="jpeg">JPEG</option>
            <option value="webp">WebP</option>
          </select>
        </label>
        <label>
          <span>压缩率</span>
          <input
            type={spec.format === "jpeg" ? "number" : "text"}
            min={40}
            max={100}
            value={spec.format === "jpeg" ? spec.quality : "N/A"}
            disabled={spec.format !== "jpeg"}
            onChange={(e) => patch({ quality: Number(e.target.value) })}
          />
        </label>
      </div>

      <div className="isp-help">PNG 和 WebP 不做压缩率控制；下载时会按所选格式保存。</div>
    </div>
  );
}
