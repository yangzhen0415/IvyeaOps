import { useMemo, useState } from "react";
import ChatPane from "../../../components/ChatPane";
import AgentShell from "../agent/shell/AgentShell";
import AgentFiles from "../agent/files/AgentFiles";
import TranscriptViewer from "./TranscriptViewer";
import GitPanel from "./git/GitPanel";
import { useHubSession } from "./useHubSession";
import type { Project, ProjectSession } from "../../../api/projects";
import { resumeExternalSession } from "../../../api/projects";
import { TAB_LABELS, type TabKey, availableTabsFor } from "./tabs";

type Props = {
  project: Project;
  projectSession: ProjectSession;
  /** Controlled: parent owns which tab is active (so MobileBottomNav and
   * TopBar can drive it from outside). */
  activeTab: TabKey;
  onTabChange: (next: TabKey) => void;
  /** Caller switches the workspace selection to the new hub session created
   * by a successful "继续会话" action. */
  onResumed: (newHubSessionId: string) => void;
};

/**
 * The main content area for a selected session.
 *
 * Picks the available tabs based on session source:
 *   – hub      : chat / shell / files / git
 *   – claude   : transcript / files / git   (read-only; resume promotes to hub)
 *   – codex    : transcript / files / git   (same)
 *
 * Files defaults to the project's workdir for external sessions and the
 * session's own workdir for hub sessions.
 *
 * Git is a placeholder until Phase C wires the GitPanel; we still show
 * the tab so the UX is stable.
 */
export default function MainTabs({ project, projectSession, activeTab, onTabChange, onResumed }: Props) {
  const isHub = projectSession.source === "hub";
  const isExternal = projectSession.source === "claude" || projectSession.source === "codex";
  const availableTabs: TabKey[] = availableTabsFor(projectSession.source);
  const [showCli, setShowCli] = useState(false);
  const [showInherited, setShowInherited] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [resumeErr, setResumeErr] = useState<string | null>(null);

  const handleResume = async () => {
    if (resuming) return;
    setResuming(true);
    setResumeErr(null);
    try {
      const r = await resumeExternalSession(project.id, projectSession.id);
      onResumed(r.session_id);
    } catch (e: any) {
      setResumeErr(e?.response?.data?.detail || e?.message || "继续会话失败");
    } finally {
      setResuming(false);
    }
  };

  // Fetch the hub session object when needed (chat / shell need the full
  // AgentSession). For external sessions this stays in idle state.
  const hubId = isHub ? projectSession.id : null;
  const { state: hubState, session: hubSession } = useHubSession(hubId);

  const filesPath = useMemo(() => {
    if (isHub && hubSession?.workdir) return hubSession.workdir;
    if (project.path && project.path !== "(unknown)") return project.path;
    return "/root";
  }, [isHub, hubSession, project.path]);

  return (
    <div className="ws-tabs-wrap">
      <div className="ws-tabs-bar">
        {availableTabs.map((t) => (
          <button
            key={t}
            className={"ws-tab" + (activeTab ===t ? " active" : "")}
            onClick={() => onTabChange(t)}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
        <div className="ws-tabs-spacer" />
        {isHub && hubSession && activeTab === "chat" && (
          <div className="ws-tabs-meta">
            <label>
              <input type="checkbox" checked={showCli} onChange={(e) => setShowCli(e.target.checked)} />
              终端片段
            </label>
            <label>
              <input type="checkbox" checked={showInherited} onChange={(e) => setShowInherited(e.target.checked)} />
              上下文
            </label>
            <span>token≈{hubSession.token_estimate}</span>
            <span style={{ color: hubSession.live ? "var(--acc)" : "var(--t3)" }}>
              {hubSession.live ? "●" : "○"}
            </span>
          </div>
        )}
        {isHub && !hubSession && <span className="ws-tabs-pending" title="加载 hub 会话中…">…</span>}
        {isExternal && activeTab === "transcript" && (
          <div className="ws-tabs-meta">
            <span style={{ fontFamily: "var(--font)", color: "var(--t3)" }}>{projectSession.id.slice(0, 10)}…</span>
            <button
              className="tbtn tbtn-acc"
              onClick={handleResume}
              disabled={resuming}
              title="以 --resume 加载历史，生成新 hub 会话继续聊"
            >
              {resuming ? "继续中…" : "↻ 继续会话"}
            </button>
          </div>
        )}
      </div>

      {resumeErr && (
        <div className="ws-transcript-err" style={{ padding: "4px 12px" }}>⚠ {resumeErr}</div>
      )}

      <div className="ws-tab-body">
        {activeTab ==="chat" && (
          isHub ? (
            hubState.kind === "ok" && hubSession ? (
              <ChatPane session={hubSession} showCli={showCli} showInherited={showInherited} />
            ) : hubState.kind === "err" ? (
              <Empty msg={`加载会话失败：${hubState.detail}`} />
            ) : (
              <Empty msg="加载会话中…" />
            )
          ) : (
            <Empty msg="外部会话不支持直接聊天。请使用「继续会话」生成 hub 会话后再聊。" />
          )
        )}

        {activeTab ==="shell" && (
          isHub ? (
            hubState.kind === "ok" && hubSession ? (
              <AgentShell session={hubSession} />
            ) : hubState.kind === "err" ? (
              <Empty msg={`加载会话失败：${hubState.detail}`} />
            ) : (
              <Empty msg="加载会话中…" />
            )
          ) : (
            <Empty msg="外部会话不能直接连终端 PTY。点「继续会话」后会自动以 --resume 拉起 CLI。" />
          )
        )}

        {activeTab ==="files" && (
          <AgentFiles initialPath={filesPath} />
        )}

        {activeTab ==="transcript" && isExternal && (
          <TranscriptViewer
            project={project}
            projectSession={projectSession}
            onResumed={onResumed}
          />
        )}

        {activeTab ==="git" && (
          <GitPanel project={project} />
        )}
      </div>
    </div>
  );
}

function Empty({ msg, extra }: { msg: string; extra?: string }) {
  return (
    <div className="ws-tab-empty">
      <div className="ws-tab-empty-msg">{msg}</div>
      {extra && <code className="ws-tab-empty-extra">{extra}</code>}
    </div>
  );
}

