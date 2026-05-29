/* Skill Tools API client */
import { api } from "./client";
import type { SseEvent } from "./deepAnalysis";
export type { SseEvent } from "./deepAnalysis";
import { consumeSSE } from "./deepAnalysis";

export interface SkillToolMeta {
  name: string;
  category: string | null;
  description: string | null;
  description_zh: string | null;
  icon: string;
  inputs: SkillInput[];
  has_execution: boolean;
  pinned?: boolean;
}

export interface SkillInput {
  name: string;
  type: string;       // text, select, number, textarea
  label: string;
  required: boolean;
  placeholder: string;
  default: string;
  options: string[];
}

export interface SkillToolListResponse {
  tools: SkillToolMeta[];
  categories: Record<string, number>;
}

export async function listTools(category?: string, q?: string): Promise<SkillToolListResponse> {
  const params: Record<string, string> = {};
  if (category) params.category = category;
  if (q) params.q = q;
  const { data } = await api.get("/skill-tools/list", { params });
  return data;
}

export async function listPinnedTools(): Promise<SkillToolMeta[]> {
  const { data } = await api.get("/skill-tools/pinned");
  return data;
}

export async function pinTool(skillName: string, pinned: boolean): Promise<SkillToolMeta> {
  const { data } = await api.post("/skill-tools/pin", { skill_name: skillName, pinned });
  return data;
}

export function runTool(
  skillName: string,
  params: Record<string, string>,
  onEvent: (evt: SseEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  return fetch("/api/skill-tools/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ skill_name: skillName, params }),
    signal,
  }).then((resp) => {
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return consumeSSE(resp, onEvent);
  });
}
