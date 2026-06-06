'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

interface Props { projectId: string | null; }

interface GenImage { id: string; type: string; url: string; size: string; }

const TYPE_LABELS: Record<string, string> = {
  main_1x1: '主图 1:1',
  aplus_header: 'A+ 顶部横幅',
  aplus_standard: 'A+ 标准/多栏',
  brand_story: '品牌故事/大图',
};

export default function ImageGenPanel({ projectId }: Props) {
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<GenImage[]>([]);
  const [error, setError] = useState('');

  const handleGenerateAll = async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      await api.images.generateAll(projectId);
      const result = await api.images.list(projectId);
      setImages(result);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  if (!projectId) return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-2">⑤ 图片生成</h2>
      <p className="text-gray-500">请先完成前置步骤</p>
    </div>
  );

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-1">⑤ 图片生成 — OpenAI gpt-image-1 (GPT Image-2)</h2>
      <p className="text-sm text-gray-500 mb-6">主图 1:1 | A+ 顶部横幅 | A+ 标准/多栏 | 品牌故事/大图</p>

      <button
        onClick={handleGenerateAll}
        disabled={loading}
        className="px-6 py-2 bg-red-500 text-white rounded font-medium disabled:opacity-50 mb-6"
      >
        {loading ? '图片生成中（可能需要数分钟）...' : '批量生成所有图片'}
      </button>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      {images.length > 0 && (
        <div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            {Object.keys(TYPE_LABELS).map(type => {
              const count = images.filter(i => i.type === type).length;
              return (
                <div key={type} className="text-center p-3 border rounded-lg">
                  <div className="text-2xl font-bold text-orange-600">{count}</div>
                  <div className="text-xs text-gray-500">{TYPE_LABELS[type]}</div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {images.map(img => (
              <div key={img.id} className="border rounded-lg overflow-hidden">
                <img src={img.url} alt={img.type} className="w-full aspect-square object-cover" />
                <div className="p-2 text-xs text-gray-500">
                  {TYPE_LABELS[img.type] || img.type} • {img.size}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
