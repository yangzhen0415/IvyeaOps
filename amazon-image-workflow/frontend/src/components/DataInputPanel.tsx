'use client';

import { useState, useRef } from 'react';
import { api } from '@/lib/api';

const MARKETPLACES = ['US', 'UK', 'DE', 'JP', 'FR', 'IT', 'ES', 'CA', 'AU'];

interface Props {
  onProjectCreated: (id: string) => void;
  projectId: string | null;
}

export default function DataInputPanel({ onProjectCreated, projectId }: Props) {
  const [asin, setAsin] = useState('');
  const [marketplace, setMarketplace] = useState('US');
  const [link1688, setLink1688] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const project = await api.projects.create({ asin: asin || undefined, marketplace, link1688: link1688 || undefined });
      onProjectCreated(project.id);
    } catch (err: any) {
      alert(err.message);
    }
    setLoading(false);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!projectId || !e.target.files?.length) return;
    const formData = new FormData();
    Array.from(e.target.files).forEach(f => formData.append('images', f));
    try {
      const res = await api.projects.upload(projectId, formData);
      setUploadedUrls(prev => [...prev, ...res.urls]);
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-1">① 数据输入</h2>
      <p className="text-sm text-gray-500 mb-6">ASIN + 站点选择 | 1688 供应链链接 | 本地图片拖拽上传</p>

      <div className="grid md:grid-cols-3 gap-6">
        {/* ASIN Input */}
        <div className="border rounded-lg p-4">
          <h3 className="font-medium mb-3">ASIN + 站点选择</h3>
          <input
            placeholder="输入 ASIN (如 B0XXXXXXXX)"
            value={asin}
            onChange={e => setAsin(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm mb-3"
          />
          <select
            value={marketplace}
            onChange={e => setMarketplace(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
          >
            {MARKETPLACES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        {/* 1688 Link */}
        <div className="border rounded-lg p-4">
          <h3 className="font-medium mb-3">1688 供应链链接</h3>
          <input
            placeholder="粘贴 1688 商品链接"
            value={link1688}
            onChange={e => setLink1688(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
          />
          <p className="text-xs text-gray-400 mt-2">用于参考供应商原始图片</p>
        </div>

        {/* Image Upload */}
        <div className="border rounded-lg p-4">
          <h3 className="font-medium mb-3">本地图片拖拽上传</h3>
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-orange-300 transition"
          >
            <p className="text-sm text-gray-500">点击或拖拽图片到此处</p>
            <p className="text-xs text-gray-400 mt-1">支持 JPG/PNG/WebP</p>
          </div>
          <input ref={fileRef} type="file" multiple accept="image/*" onChange={handleUpload} className="hidden" />
          {uploadedUrls.length > 0 && (
            <p className="text-xs text-green-600 mt-2">已上传 {uploadedUrls.length} 张图片</p>
          )}
        </div>
      </div>

      <div className="mt-6 flex items-center gap-4">
        <button
          onClick={handleCreate}
          disabled={loading || (!asin && !link1688)}
          className="px-6 py-2 bg-orange-500 text-white rounded font-medium disabled:opacity-50"
        >
          {loading ? '创建中...' : '创建项目'}
        </button>
        {projectId && (
          <span className="text-sm text-green-600">✓ 项目已创建: {projectId.slice(0, 8)}...</span>
        )}
      </div>
    </div>
  );
}
