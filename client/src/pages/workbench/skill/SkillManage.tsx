import { Suspense } from "react";
import SkillBrowse from "../../skill/SkillBrowse";

export default function SkillManage() {
  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--t3)", marginBottom: 10 }}>
        浏览、搜索、编辑 Skill 文件。点击 Skill 进入编辑器。
      </div>
      <Suspense fallback={<div style={{ fontSize: 10, color: "var(--t3)", padding: 20 }}>加载中…</div>}>
        <SkillBrowse />
      </Suspense>
    </div>
  );
}
