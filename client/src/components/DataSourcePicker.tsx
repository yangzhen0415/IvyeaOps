import { useEffect, useRef, useState } from "react";
import { DATA_SOURCES, dataSourceMeta, type DataSourceId } from "../lib/dataSource";

// Shared market-data source dropdown for 首页 / 市场调研 / 打法推荐.
// Reuses the existing `market-mkt-*` topbar dropdown styles. Only Sorftime is
// wired today; the others render a 「即将支持」 badge (see lib/dataSource).
export default function DataSourcePicker({
  value,
  onChange,
  disabled,
}: {
  value: DataSourceId;
  onChange: (id: DataSourceId) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const cur = dataSourceMeta(value);

  return (
    <div className="market-mkt-wrap" ref={ref}>
      <button
        className="market-mkt-btn"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        title="选择数据源"
      >
        <span className="market-mkt-code">数据源：{cur.name}</span>
        <span className="market-mkt-arrow">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="market-mkt-dropdown">
          {DATA_SOURCES.map((s) => (
            <button
              key={s.id}
              className={"market-mkt-option" + (value === s.id ? " active" : "")}
              onClick={() => { onChange(s.id); setOpen(false); }}
            >
              <span className="market-mkt-option-name">{s.name}</span>
              {!s.ready && (
                <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--amber, #fbbf24)" }}>
                  {s.note}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
