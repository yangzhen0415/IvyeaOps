'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

const KEY_CONFIGS = [
  { name: 'openai', label: 'OpenAI', desc: 'gpt-image-1 图片生成', hasUrl: true, urlPlaceholder: 'https://api.openai.com/v1' },
  { name: 'claude', label: 'Claude (Anthropic)', desc: 'AI 分析（默认用本地代理）', hasUrl: true, urlPlaceholder: 'http://127.0.0.1:8000' },
  { name: 'seller_sprite', label: '卖家精灵', desc: 'SIF 关键词数据', hasUrl: false },
  { name: 'sorftime', label: 'Sorftime', desc: '补充市场词库', hasUrl: false },
  { name: 'rainforest', label: 'Rainforest API', desc: '采集备选方案', hasUrl: true, urlPlaceholder: 'https://api.rainforestapi.com' },
];

export default function SettingsPanel() {
  const [keys, setKeys] = useState<{ id: string; name: string; updatedAt: string }[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => { api.settings.list().then(setKeys).catch(() => {}); }, []);

  const configuredCount = KEY_CONFIGS.filter(c => keys.some(k => k.name === c.name)).length;

  const handleSave = async (name: string) => {
    if (!values[name] && !urls[name]) return;
    setSaving(name);
    try {
      if (values[name]) await api.settings.save(name, values[name]);
      if (urls[name]) await api.settings.save(name + '_url', urls[name]);
      const updated = await api.settings.list();
      setKeys(updated);
      setValues(v => ({ ...v, [name]: '' }));
      setUrls(v => ({ ...v, [name]: '' }));
    } catch (err: any) {
      alert(err.message);
    }
    setSaving(null);
  };

  const isConfigured = (name: string) => keys.some(k => k.name === name);
  const hasUrl = (name: string) => keys.some(k => k.name === name + '_url');

  return (
    <div className="card">
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer'}} onClick={() => setOpen(!open)}>
        <div>
          <span className="card-title">⚙️ API 配置</span>
          <span className="field-hint" style={{marginLeft:'12px'}}>
            {configuredCount > 0 ? `${configuredCount} 项已配置` : 'Claude 默认使用本地代理，无需配置'}
          </span>
        </div>
        <button className="btn-outline" style={{padding:'3px 10px',fontSize:'11px'}}>
          {open ? '收起 ▲' : '展开 ▼'}
        </button>
      </div>

      {open && (
        <div style={{marginTop:'12px',display:'grid',gap:'8px'}}>
          <div style={{fontSize:'10px',color:'var(--t3)',marginBottom:'4px'}}>
            💡 Claude 分析默认使用本地 kiro-gateway 代理，无需额外配置。如需使用官方 API 或其他服务，可在此设置。
          </div>
          {KEY_CONFIGS.map(cfg => (
            <div key={cfg.name} className="field-group">
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'8px'}}>
                <div>
                  <span className="field-label">{cfg.label}</span>
                  <span className="field-hint">{cfg.desc}</span>
                </div>
                <div style={{display:'flex',gap:'4px'}}>
                  {isConfigured(cfg.name) && <span className="badge-ok">Key ✓</span>}
                  {cfg.hasUrl && hasUrl(cfg.name) && <span className="badge-ok">URL ✓</span>}
                </div>
              </div>
              <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
                {cfg.hasUrl && (
                  <input
                    type="text"
                    placeholder={cfg.urlPlaceholder || 'API Base URL'}
                    value={urls[cfg.name] || ''}
                    onChange={e => setUrls(v => ({ ...v, [cfg.name]: e.target.value }))}
                    style={{flex:'1',minWidth:'200px'}}
                  />
                )}
                <input
                  type="password"
                  placeholder={isConfigured(cfg.name) ? '••••••（已保存）' : 'API Key'}
                  value={values[cfg.name] || ''}
                  onChange={e => setValues(v => ({ ...v, [cfg.name]: e.target.value }))}
                  style={{flex:'1',minWidth:'160px'}}
                />
                <button
                  onClick={() => handleSave(cfg.name)}
                  disabled={(!values[cfg.name] && !urls[cfg.name]) || saving === cfg.name}
                  className="btn"
                >
                  {saving === cfg.name ? '...' : '保存'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
