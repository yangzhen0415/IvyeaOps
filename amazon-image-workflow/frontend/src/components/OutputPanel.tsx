'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

interface Props { projectId: string | null; }

export default function OutputPanel({ projectId }: Props) {
  const [templateName, setTemplateName] = useState('');
  const [templates, setTemplates] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.output.templates().then(setTemplates).catch(() => {}); }, []);

  const handleDownload = () => {
    if (!projectId) return;
    window.open(api.output.downloadUrl(projectId), '_blank');
  };

  const handleSaveTemplate = async () => {
    if (!projectId || !templateName) return;
    setSaving(true);
    try {
      await api.output.saveTemplate(projectId, templateName, 'general');
      const updated = await api.output.templates();
      setTemplates(updated);
      setTemplateName('');
    } catch (err: any) {
      alert(err.message);
    }
    setSaving(false);
  };

  if (!projectId) return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-2">输出</h2>
      <p className="text-gray-500">请先完成前置步骤</p>
    </div>
  );

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-1">输出 — 批量下载 / 存为模板 / 导出到亚马逊</h2>
      <p className="text-sm text-gray-500 mb-6">Cloudflare R2 存储 · PostgreSQL 模板/历史库</p>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Download */}
        <div className="border rounded-lg p-4">
          <h3 className="font-medium mb-3">批量下载</h3>
          <p className="text-sm text-gray-500 mb-3">将所有生成的图片打包为 ZIP 下载</p>
          <button
            onClick={handleDownload}
            className="w-full px-4 py-2 bg-blue-500 text-white rounded text-sm"
          >
            下载 ZIP
          </button>
        </div>

        {/* Save Template */}
        <div className="border rounded-lg p-4">
          <h3 className="font-medium mb-3">存为模板</h3>
          <p className="text-sm text-gray-500 mb-3">保存当前提示词组合为可复用模板</p>
          <input
            placeholder="模板名称"
            value={templateName}
            onChange={e => setTemplateName(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm mb-2"
          />
          <button
            onClick={handleSaveTemplate}
            disabled={saving || !templateName}
            className="w-full px-4 py-2 bg-green-500 text-white rounded text-sm disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存模板'}
          </button>
        </div>

        {/* Export */}
        <div className="border rounded-lg p-4">
          <h3 className="font-medium mb-3">导出到亚马逊</h3>
          <p className="text-sm text-gray-500 mb-3">通过 SP-API 直接上传到 Amazon Seller Central</p>
          <button
            disabled
            className="w-full px-4 py-2 bg-orange-500 text-white rounded text-sm opacity-50 cursor-not-allowed"
          >
            导出 (需配置 SP-API)
          </button>
        </div>
      </div>

      {/* Template History */}
      {templates.length > 0 && (
        <div className="mt-6">
          <h3 className="font-medium mb-3">已保存模板</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {templates.map(t => (
              <div key={t.id} className="border rounded p-3 text-sm">
                <div className="font-medium">{t.name}</div>
                <div className="text-xs text-gray-400">{new Date(t.createdAt).toLocaleDateString()}</div>
                <button
                  onClick={async () => {
                    await api.output.applyTemplate(projectId, t.id);
                    alert('模板已应用，请到提示词引擎查看');
                  }}
                  className="text-xs text-blue-500 mt-1 hover:underline"
                >
                  应用到当前项目
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
