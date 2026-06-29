import { lazy, Suspense, useState } from "react";
import SkillTools from "./SkillTools";
import IdeaSkill from "./IdeaSkill";
import SkillManage from "./skill/SkillManage";

const ImportGitHubDialog = lazy(() => import("../skill/ImportGitHubDialog"));

const TABS = [
  { key: "tools", label: "工具" },
  { key: "create", label: "创建" },
  { key: "manage", label: "管理" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function SkillHub() {
  const [tab, setTab] = useState<TabKey>("tools");
  const [showGithubImport, setShowGithubImport] = useState(false);

  return (
    <div className="modern-page modern-skill-hub">
      <div className="modern-page-head">
        <div className="ptitle" style={{ marginBottom: 0 }}>/ Skill 中心</div>
        <div className="modern-segmented">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={tab === t.key ? "active" : ""}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "tools" && <div className="skill-hub-tab wb-enter"><SkillTools /></div>}
      {tab === "create" && <div className="skill-hub-tab wb-enter"><IdeaSkill /></div>}
      {tab === "manage" && (
        <div className="wb-enter">
          <div style={{ marginBottom: 10, display: "flex", gap: 8 }}>
            <button
              className="tbtn"
              onClick={() => setShowGithubImport(true)}
              style={{ fontSize: 10 }}
            >
              ⬇ 从 GitHub 导入 Skill
            </button>
          </div>
          <SkillManage />
        </div>
      )}

      {showGithubImport && (
        <Suspense fallback={null}>
          <ImportGitHubDialog onClose={() => setShowGithubImport(false)} />
        </Suspense>
      )}
    </div>
  );
}
