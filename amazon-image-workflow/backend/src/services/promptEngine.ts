import Anthropic from '@anthropic-ai/sdk';
import { PrismaClient } from '@prisma/client';
import { getApiKey } from '../routes/settings.js';

const prisma = new PrismaClient();

// 模板库驱动 (10条/任务): 主图提示词, A+各类型提示词, 品牌故事提示词
const PROMPT_TEMPLATES = {
  main_image: `Generate a professional Amazon main image prompt for:
Product: {title}
USP: {usp}
Requirements: White background, 1:1 ratio (1000x1000px), product centered, high-resolution photography style, no text overlay, clean and professional, showing the product from the best angle to highlight: {usp}
Keywords to incorporate visually: {keywords}`,

  aplus_header: `Generate an Amazon A+ Content header banner prompt:
Product: {title}
Brand Story: {usp}
Requirements: Wide horizontal banner (970x600px), lifestyle scene, brand colors, premium feel, product in-use scenario showing: {scenario}
Visual keywords: {keywords}`,

  aplus_standard: `Generate an Amazon A+ standard module image prompt:
Product: {title}
Feature Focus: {feature}
Requirements: Standard module size, comparison or feature highlight, clean infographic style, showing specific benefit: {feature}
Context: {scenario}`,

  aplus_multi: `Generate an Amazon A+ multi-image module prompt:
Product: {title}
Angle: {angle}
Requirements: Multiple product angles or use cases, consistent style, showing product versatility
USP: {usp}`,

  brand_story: `Generate an Amazon Brand Story large image prompt:
Brand: {title}
Story: {usp}
Requirements: Large format (1464x625px), cinematic brand storytelling, emotional connection, lifestyle imagery, premium brand positioning
Scene: {scenario}
Mood: aspirational, authentic, premium`,
};

interface PromptContext {
  title: string;
  usp: string;
  keywords: string;
  scenario: string;
  features: string[];
}

export async function generatePrompts(projectId: string): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { scrapeData: true, analysis: true },
  });
  if (!project?.analysis) throw new Error('Analysis not completed');

  const claudeKey = await getApiKey('claude') || 'hermes2024';
  const claudeUrl = await getApiKey('claude_url') || 'http://127.0.0.1:8000';

  const client = new Anthropic({ apiKey: claudeKey, ...(claudeUrl && { baseURL: claudeUrl }) });
  const ctx: PromptContext = {
    title: project.scrapeData?.title || '',
    usp: project.analysis.uspExtraction || '',
    keywords: project.analysis.sifKeywords.slice(0, 10).join(', '),
    scenario: project.analysis.productAnalysis || '',
    features: project.scrapeData?.bullets || [],
  };

  // Generate 10 prompts per task using Claude to refine templates
  const promptRequest = `你是一位专业的AI图片生成提示词工程师。基于以下商品信息，生成10条高质量的图片生成提示词。

商品: ${ctx.title}
核心卖点: ${ctx.usp}
关键词: ${ctx.keywords}
使用场景: ${ctx.scenario}
产品特点: ${ctx.features.join('; ')}

请生成以下类型的提示词（每条都要详细、具体、可直接用于GPT Image生成）：

1-3. 主图提示词 (3条，不同角度/风格)
4-6. A+ 内容提示词 (3条: 顶部横幅、标准模块、多栏模块)
7-8. A+ 对比/特写提示词 (2条)
9-10. 品牌故事提示词 (2条，大图格式)

每条格式：
[类型] 提示词内容

要求：英文输出，专业摄影/3D渲染风格，包含具体的构图、光线、色彩指导。`;

  const res = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 5000,
    messages: [{ role: 'user', content: promptRequest }],
  });

  const text = res.content[0].type === 'text' ? res.content[0].text : '';

  // Parse and save prompts
  await prisma.prompt.deleteMany({ where: { projectId } });

  const lines = text.split('\n').filter(l => l.trim());
  let order = 0;
  const typeMap: Record<string, string> = {
    '主图': 'main_image', 'Main': 'main_image',
    'A+': 'aplus_type', 'Header': 'aplus_type', 'Standard': 'aplus_type',
    '品牌': 'brand_story', 'Brand': 'brand_story',
  };

  let currentType = 'main_image';
  for (const line of lines) {
    if (line.match(/^\d+[\.\)]/)) {
      order++;
      // Detect type from line content
      for (const [key, val] of Object.entries(typeMap)) {
        if (line.includes(key)) { currentType = val; break; }
      }
      const content = line.replace(/^\d+[\.\)]\s*(\[.*?\])?\s*/, '').trim();
      if (content.length > 20) {
        await prisma.prompt.create({
          data: { projectId, type: currentType, content, order },
        });
      }
    }
  }

  // If parsing didn't get enough, save the whole text as structured prompts
  const savedCount = await prisma.prompt.count({ where: { projectId } });
  if (savedCount < 5) {
    await prisma.prompt.deleteMany({ where: { projectId } });
    // Split by double newline and save each block
    const blocks = text.split(/\n\n+/).filter(b => b.trim().length > 30);
    for (let i = 0; i < blocks.length && i < 10; i++) {
      const type = i < 3 ? 'main_image' : i < 7 ? 'aplus_type' : 'brand_story';
      await prisma.prompt.create({
        data: { projectId, type, content: blocks[i].trim(), order: i + 1 },
      });
    }
  }
}

export { PROMPT_TEMPLATES };
