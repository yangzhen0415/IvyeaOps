import { useEffect, useState } from "react";
import {
  adminListUsers, adminSetUserStatus, adminResetUserPassword, adminDeleteUser,
  type ManagedUser,
} from "../../api/client";
import { useAuth } from "../../App";

const STATUS_LABEL: Record<string, string> = {
  pending: "待审批", active: "已启用", suspended: "已停用",
};
const STATUS_COLOR: Record<string, string> = {
  pending: "var(--amber)", active: "var(--acc)", suspended: "var(--red)",
};

export default function Users() {
  const { role } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = async () => {
    setLoading(true);
    try { setUsers(await adminListUsers()); setErr(""); }
    catch (e: any) { setErr(e?.response?.data?.detail || "加载失败"); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (role === "admin") load(); else setLoading(false); }, [role]);

  if (role !== "admin") {
    return <div className="market-page"><div className="market-error">需要管理员权限</div></div>;
  }

  const setStatus = async (u: ManagedUser, status: "active" | "suspended") => {
    await adminSetUserStatus(u.id, status).catch(() => {});
    load();
  };
  const resetPw = async (u: ManagedUser) => {
    const pw = window.prompt(`为 ${u.email} 设置新密码（至少 8 位）`);
    if (!pw) return;
    try { await adminResetUserPassword(u.id, pw); alert("已重置"); }
    catch (e: any) { alert(e?.response?.data?.detail || "重置失败"); }
  };
  const del = async (u: ManagedUser) => {
    if (!window.confirm(`删除用户 ${u.email}？其数据也将无法访问。`)) return;
    await adminDeleteUser(u.id).catch(() => {});
    load();
  };

  const fmt = (ts: number | null) => ts ? new Date(ts).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

  return (
    <div className="market-page">
      <div className="market-header">
        <span className="market-title"><span className="market-title-icon">⊙</span> 用户管理</span>
        <button className="tbtn" style={{ marginLeft: "auto" }} onClick={load}>↻ 刷新</button>
      </div>

      {err && <div className="market-error">{err}</div>}
      {loading ? (
        <div className="pulse-loading"><span className="pulse-spin">◌</span> 加载中…</div>
      ) : users.length === 0 ? (
        <div className="market-empty"><div className="market-empty-icon">⊙</div><div className="market-empty-title">暂无注册用户</div></div>
      ) : (
        <div className="cat-table-wrap">
          <table className="cat-table">
            <thead><tr><th>邮箱</th><th>角色</th><th>状态</th><th>注册时间</th><th>操作</th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>{u.role}</td>
                  <td><span style={{ color: STATUS_COLOR[u.status] }}>{STATUS_LABEL[u.status] || u.status}</span></td>
                  <td>{fmt(u.created_at)}</td>
                  <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {u.status !== "active" && <button className="tbtn tbtn-acc" onClick={() => setStatus(u, "active")}>启用</button>}
                    {u.status === "active" && <button className="tbtn" onClick={() => setStatus(u, "suspended")}>停用</button>}
                    <button className="tbtn" onClick={() => resetPw(u)}>重置密码</button>
                    <button className="tbtn danger" onClick={() => del(u)}>删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
