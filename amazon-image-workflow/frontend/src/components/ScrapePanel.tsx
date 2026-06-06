'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

interface Props { projectId: string | null; }

export default function ScrapePanel({ projectId }: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  const handleScrape = async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const result = await api.scrape.run(projectId);
      setData(result);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  if (!projectId) return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-2">② 采集 (Puppeteer / Rainforest API)</h2>
      <p className="text-gray-500">请先在"数据输入"步骤创建项目</p>
    </div>
  );

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-1">② 采集 (Puppeteer / Rainforest API)</h2>
      <p className="text-sm text-gray-500 mb-6">产品图片抓取 (7张) | Listing 文本提取 (标题/五点/描述)</p>

      <button
        onClick={handleScrape}
        disabled={loading}
        className="px-6 py-2 bg-blue-500 text-white rounded font-medium disabled:opacity-50 mb-6"
      >
        {loading ? '采集中...' : '开始采集'}
      </button>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      {data && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Images */}
          <div className="border rounded-lg p-4">
            <h3 className="font-medium mb-3">产品图片抓取 ({data.imageUrls?.length || 0}/7张)</h3>
            <div className="grid grid-cols-4 gap-2">
              {data.imageUrls?.map((url: string, i: number) => (
                <img key={i} src={url} alt={`Product ${i + 1}`} className="w-full aspect-square object-cover rounded border" />
              ))}
            </div>
          </div>

          {/* Text */}
          <div className="border rounded-lg p-4">
            <h3 className="font-medium mb-3">Listing 文本提取</h3>
            <div className="space-y-3 text-sm">
              <div>
                <span className="font-medium text-gray-600">标题:</span>
                <p className="text-gray-800">{data.title}</p>
              </div>
              <div>
                <span className="font-medium text-gray-600">五点描述:</span>
                <ul className="list-disc pl-4 text-gray-700">
                  {data.bullets?.map((b: string, i: number) => <li key={i}>{b}</li>)}
                </ul>
              </div>
              <div>
                <span className="font-medium text-gray-600">描述:</span>
                <p className="text-gray-700 line-clamp-4">{data.description}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
