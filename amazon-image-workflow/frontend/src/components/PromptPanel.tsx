'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

interface Props { projectId: string | null; }

interface Prompt { id: string; type: string; content: string; order: number; }

const TYPE_LABELS: Record<string, string> = {
  main_image: '主图提示词',
  aplus_type: 'A+ 各类型提示词',
  brand_story: '品牌故事提示词',
};

export default function PromptPanel({ projectId }: Props) {
  const [loading, setLoading] = useState(false);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const result = await api.prompts.generate(projectId);
      setPrompts(result);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleSave = async (id: string) => {
    await api.prompts.update(id, editContent);
    setPrompts(prompts.map(p => p.id === id ? { ...p, content: editContent } : p));
    setEditing(null);
  };

  if (!projectId) return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-2">④ 提示词引擎</h2>
      <p className="text-gray-500">请先完成前置步骤</p>
    </div>
  );

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-1">④ 提示词引擎 — 模板库驱动 (10条/任务)</h2>
      <p className="text-sm text-gray-500 mb-6">主图提示词 | A+ 各类型提示词 | 品牌故事提示词</p>

      <button
        onClick={handleGenerate}
        disabled={loading}
        className="px-6 py-2 bg-green-500 text-white rounded font-medium disabled:opacity-50 mb-6"
      >
        {loading ? '生成提示词中...' : '生成提示词 (10条)'}
      </button>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      {prompts.length > 0 && (
        <div className="space-y-3">
          {prompts.map(prompt => (
            <div key={prompt.id} className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100">
                  #{prompt.order} {TYPE_LABELS[prompt.type] || prompt.type}
                </span>
                <button
                  onClick={() => { setEditing(prompt.id); setEditContent(prompt.content); }}
                  className="text-xs text-blue-500 hover:underline"
                >
                  编辑
                </button>
              </div>
              {editing === prompt.id ? (
                <div>
                  <textarea
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    className="w-full border rounded p-2 text-sm h-32"
                  />
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => handleSave(prompt.id)} className="text-xs bg-blue-500 text-white px-3 py-1 rounded">保存</button>
                    <button onClick={() => setEditing(null)} className="text-xs text-gray-500">取消</button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{prompt.content}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
