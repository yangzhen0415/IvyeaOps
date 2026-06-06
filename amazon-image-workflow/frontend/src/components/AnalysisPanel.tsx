'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

interface Props { projectId: string | null; }

export default function AnalysisPanel({ projectId }: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  const handleAnalysis = async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const result = await api.analysis.run(projectId);
      setData(result);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  if (!projectId) return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-2">③ AI 分析层</h2>
      <p className="text-gray-500">请先创建项目并完成采集</p>
    </div>
  );

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-1">③ AI 分析层</h2>
      <p className="text-sm text-gray-500 mb-6">Claude 商品分析 + Rufus & COSMO 模块</p>

      <button
        onClick={handleAnalysis}
        disabled={loading}
        className="px-6 py-2 bg-purple-500 text-white rounded font-medium disabled:opacity-50 mb-6"
      >
        {loading ? 'AI分析中（约30秒）...' : '开始AI分析'}
      </button>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      {data && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Claude 商品分析 */}
          <div className="space-y-4">
            <div className="border rounded-lg p-4">
              <h3 className="font-medium text-purple-700 mb-2">商品分析</h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{data.productAnalysis}</p>
            </div>
            <div className="border rounded-lg p-4">
              <h3 className="font-medium text-purple-700 mb-2">五点分析 — 结构化 bullet 优化建议</h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{data.bulletAnalysis}</p>
            </div>
            <div className="border rounded-lg p-4">
              <h3 className="font-medium text-purple-700 mb-2">卖点提炼 — 核心差异化 USP</h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{data.uspExtraction}</p>
            </div>
          </div>

          {/* Rufus & COSMO */}
          <div className="space-y-4">
            <div className="border rounded-lg p-4">
              <h3 className="font-medium text-orange-700 mb-2">
                标题 COSMO 评分 — {data.cosmoScore}/100分
              </h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{data.cosmoDetails}</p>
            </div>
            <div className="border rounded-lg p-4">
              <h3 className="font-medium text-orange-700 mb-2">Q&A 建议 (Rufus 模拟)</h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{data.rufusQA}</p>
            </div>
            <div className="border rounded-lg p-4">
              <h3 className="font-medium text-orange-700 mb-2">数据洞察 — SIF词覆盖 / 竞品对比</h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{data.dataInsights}</p>
            </div>
            {data.sifKeywords?.length > 0 && (
              <div className="border rounded-lg p-4">
                <h3 className="font-medium text-blue-700 mb-2">卖家精灵 Top SIF 关键词</h3>
                <div className="flex flex-wrap gap-1">
                  {data.sifKeywords.map((kw: string, i: number) => (
                    <span key={i} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{kw}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
