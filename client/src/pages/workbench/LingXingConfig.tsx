import { useEffect, useState } from "react";
import { api } from "../../api/client";

const inputStyle: React.CSSProperties = {
  background: "var(--bg1)", border: "1px solid var(--b)", borderRadius: 3,
  padding: "6px 8px", fontSize: 11, color: "var(--t)", outline: "none", fontFamily: "inherit", boxSizing: "border-box",
};
function Btn({ onClick, children, primary, disabled }: any) {
  return <button onClick={onClick} disabled={disabled} style={{ background: primary ? "var(--acc)" : "var(--bg2)", color: primary ? "#000" : "var(--t)", border: primary ? "none" : "1px solid var(--b)", borderRadius: 4, padding: "5px 12px", fontSize: 11, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.55 : 1 }}>{children}</button>;
}
function Card({ title, children }: any) {
  return <div className="card" style={{ padding: 12, marginBottom: 10 }}><div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>{title}</div>{children}</div>;
}
function Field({ label, children }: any) {
  return <label style={{ display: "grid", gap: 3, fontSize: 10, color: "var(--t3)" }}><span>{label}</span>{children}</label>;
}

export default function LingXingConfig() {
  const [st, setStatus] = useState<any>(null);
  const [s, setS] = useState<Record<string, any>>({});      // non-secret settings
  const [secrets, setSecrets] = useState<string[]>([]);
  const [host, setHost] = useState(""); const [appid, setAppid] = useState("");
  const [secret, setSecret] = useState(""); const [mcp, setMcp] = useState("");
  const [probe, setProbe] = useState<any>(null);
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);

  useEffect(() => { void load(); }, []);
  async function load() {
    try {
      const [stat, set] = await Promise.all([api.get("/lingxing/status"), api.get("/settings")]);
      setStatus(stat.data); setSecrets(set.data.secret_keys || []);
      const cfg = set.data.settings || {}; setS(cfg);
      setHost(cfg.lingxing_openapi_host || ""); setAppid(cfg.lingxing_openapi_appid || "");
    } catch (e: any) { setMsg(humanErr(e)); }
  }
  async function patch(updates: Record<string, any>, okMsg = "已保存") {
    setBusy(true); setMsg("");
    try { await api.patch("/settings", { settings: updates }); setMsg(okMsg); await load(); }
    catch (e: any) { setMsg(humanErr(e)); } finally { setBusy(false); }
  }
  async function saveCreds() {
    const u: Record<string, any> = { lingxing_openapi_host: host, lingxing_openapi_appid: appid };
    if (secret) u.lingxing_openapi_secret = secret;
    if (mcp) u.lingxing_mcp_key = mcp;
    await patch(u, "凭证已保存"); setSecret(""); setMcp("");
  }
  async function test() {
    setBusy(true); setMsg(""); setProbe(null);
    try { setProbe((await api.post("/lingxing/probe")).data); setMsg("测试完成"); }
    catch (e: any) { setMsg(humanErr(e)); } finally { setBusy(false); }
  }
  const setN = (k: string, v: any) => setS((o) => ({ ...o, [k]: v }));

  return (
    <div>
      <div className="card" style={{ padding: "8px 12px", marginBottom: 10, fontSize: 11, color: "var(--t3)" }}>
        开箱即用：① 填 OpenAPI 凭证 → ② 测试连接 → ③ 打开总开关。之后即可在「大盘/数据浏览/优化引擎」浏览分析；写操作另有独立「操作开关」+ 三重复核。
      </div>

      {/* ① credentials */}
      <Card title="① 领星 OpenAPI 凭证（领星 ERP → 开放接口）">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Field label="API 域名"><input value={host} onChange={(e) => setHost(e.target.value)} style={{ ...inputStyle, width: 280 }} placeholder="https://openapi.lingxing.com" /></Field>
          <Field label="AppID"><input value={appid} onChange={(e) => setAppid(e.target.value)} style={{ ...inputStyle, width: 200 }} /></Field>
          <Field label={`AppSecret ${s.lingxing_openapi_secret ? "（已配置，留空不改）" : "（未配置）"}`}>
            <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} style={{ ...inputStyle, width: 220 }} placeholder={s.lingxing_openapi_secret ? "••••••••" : "填入"} /></Field>
          <Field label={`MCP key（可选）${s.lingxing_mcp_key ? "（已配置）" : ""}`}>
            <input type="password" value={mcp} onChange={(e) => setMcp(e.target.value)} style={{ ...inputStyle, width: 160 }} placeholder="可不填" /></Field>
          <Btn primary onClick={saveCreds} disabled={busy}>保存凭证</Btn>
        </div>
      </Card>

      {/* ② test */}
      <Card title="② 测试连接">
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Btn onClick={test} disabled={busy}>测试连接（probe）</Btn>
          {probe?.openapi && <span style={{ fontSize: 11, color: probe.openapi.ok ? "var(--acc)" : "var(--red)" }}>
            OpenAPI：{probe.openapi.ok ? `✓ 已连通，店铺 ${probe.openapi.probe_seller_count ?? "?"} 个` : `✗ ${probe.openapi.error}`}</span>}
          {probe?.mcp && <span style={{ fontSize: 11, color: "var(--t3)" }}>MCP：{probe.mcp.ok === false ? "未连通" : `工具 ${probe.mcp.tool_count ?? "?"} 个`}</span>}
        </div>
      </Card>

      {/* ③ switches */}
      <Card title="③ 总开关">
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: st?.master_enabled ? "var(--acc)" : "var(--t3)" }}>数据总开关：{st?.master_enabled ? "已启用" : "关闭"}</span>
          {st?.master_enabled
            ? <Btn onClick={() => patch({ lingxing_enabled: false }, "已关闭")} disabled={busy}>关闭</Btn>
            : <Btn primary onClick={() => patch({ lingxing_enabled: true }, "已启用")} disabled={busy}>启用数据（只读）</Btn>}
          <span style={{ fontSize: 10, color: "var(--t3)" }}>写操作的「操作开关」在「操作执行」tab，默认关、带自动失效。</span>
        </div>
      </Card>

      {/* ④ optimization params */}
      <Card title="④ 优化参数（保守默认；目标 ACOS 自动按毛利推）">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          {([
            ["lingxing_target_acos_factor", "目标ACOS系数(×毛利)", 90],
            ["lingxing_max_change_pct", "单步幅度上限%", 90],
            ["lingxing_bid_step_pct", "bid步长%", 80],
            ["lingxing_neg_min_clicks", "否词最小点击", 90],
            ["lingxing_cooldown_days", "冷却天数", 80],
            ["lingxing_opt_window_days", "分析窗口天", 90],
          ] as const).map(([k, lbl, w]) => (
            <Field key={k} label={lbl}><input value={s[k] ?? ""} onChange={(e) => setN(k, e.target.value)} style={{ ...inputStyle, width: w }} /></Field>
          ))}
          <Field label="写白名单店铺SID(逗号)"><input value={s.lingxing_scope_stores ?? ""} onChange={(e) => setN("lingxing_scope_stores", e.target.value)} style={{ ...inputStyle, width: 180 }} placeholder="空=禁止所有写" /></Field>
          <Btn primary onClick={() => patch({
            lingxing_target_acos_factor: Number(s.lingxing_target_acos_factor),
            lingxing_max_change_pct: Number(s.lingxing_max_change_pct), lingxing_bid_step_pct: Number(s.lingxing_bid_step_pct),
            lingxing_neg_min_clicks: Number(s.lingxing_neg_min_clicks), lingxing_cooldown_days: Number(s.lingxing_cooldown_days),
            lingxing_opt_window_days: Number(s.lingxing_opt_window_days), lingxing_scope_stores: s.lingxing_scope_stores || "",
          }, "参数已保存")} disabled={busy}>保存参数</Btn>
        </div>
        <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 6 }}>白名单为空时，任何写操作都会被护栏拦截（fail-closed）；只放你确认要自动优化的店铺。</div>
      </Card>

      {msg && <div style={{ fontSize: 11, color: "var(--t3)" }}>{msg}</div>}
    </div>
  );
}
function humanErr(e: any): string { return e?.response?.data?.detail || e?.message || "请求失败"; }
