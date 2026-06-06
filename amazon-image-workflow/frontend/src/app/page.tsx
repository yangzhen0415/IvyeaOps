'use client';

import { useState } from 'react';
import SettingsPanel from '@/components/SettingsPanel';
import DataInputPanel from '@/components/DataInputPanel';
import ScrapePanel from '@/components/ScrapePanel';
import AnalysisPanel from '@/components/AnalysisPanel';
import PromptPanel from '@/components/PromptPanel';
import ImageGenPanel from '@/components/ImageGenPanel';
import OutputPanel from '@/components/OutputPanel';

const STEPS = [
  { id: 'settings', label: '⚙️ 设置', sub: 'API Key / URL 配置' },
  { id: 'input', label: '① 数据输入', sub: 'ASIN / 1688 / 图片上传' },
  { id: 'scrape', label: '② 采集', sub: 'Puppeteer / Rainforest' },
  { id: 'analysis', label: '③ AI分析', sub: 'Claude + Rufus & COSMO' },
  { id: 'prompts', label: '④ 提示词', sub: '模板库驱动' },
  { id: 'imagegen', label: '⑤ 图片生成', sub: 'gpt-image-1' },
  { id: 'output', label: '⑥ 输出', sub: '下载 / 导出' },
];

export default function Home() {
  const [activeStep, setActiveStep] = useState('settings');
  const [projectId, setProjectId] = useState<string | null>(null);

  return (
    <div style={{display:'flex',gap:'16px',maxWidth:'1200px'}}>
      <nav className="step-nav" style={{width:'180px',flexShrink:0}}>
        {STEPS.map((step) => (
          <button
            key={step.id}
            onClick={() => setActiveStep(step.id)}
            className={activeStep === step.id ? 'active' : ''}
          >
            <div className="step-label">{step.label}</div>
            <div className="step-sub">{step.sub}</div>
          </button>
        ))}
      </nav>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display: activeStep === 'settings' ? 'block' : 'none'}}><SettingsPanel /></div>
        <div style={{display: activeStep === 'input' ? 'block' : 'none'}}><DataInputPanel onProjectCreated={setProjectId} projectId={projectId} /></div>
        <div style={{display: activeStep === 'scrape' ? 'block' : 'none'}}><ScrapePanel projectId={projectId} /></div>
        <div style={{display: activeStep === 'analysis' ? 'block' : 'none'}}><AnalysisPanel projectId={projectId} /></div>
        <div style={{display: activeStep === 'prompts' ? 'block' : 'none'}}><PromptPanel projectId={projectId} /></div>
        <div style={{display: activeStep === 'imagegen' ? 'block' : 'none'}}><ImageGenPanel projectId={projectId} /></div>
        <div style={{display: activeStep === 'output' ? 'block' : 'none'}}><OutputPanel projectId={projectId} /></div>
      </div>
    </div>
  );
}
