import Anthropic from '@anthropic-ai/sdk';
import { PrismaClient } from '@prisma/client';
import { getApiKey } from '../routes/settings.js';

const prisma = new PrismaClient();

interface AnalysisInput {
  title: string;
  bullets: string[];
  description: string;
  imageUrls: string[];
}

// Claude 商品分析: 商品分析 + 五点分析 + 卖点提炼
async function claudeProductAnalysis(input: AnalysisInput, claudeKey: string, claudeUrl?: string) {
  const client = new Anthropic({ apiKey: claudeKey, ...(claudeUrl && { baseURL: claudeUrl }) });

  const prompt = `你是一位资深的亚马逊商品分析专家。请对以下商品进行深度分析：

标题: ${input.title}
五点描述: ${input.bullets.join('\n')}
详细描述: ${input.description}

请按以下格式输出：

## 商品分析
分析商品的卖点、受众、使用场景

## 五点分析
对每个bullet point进行结构化分析，给出优化建议

## 卖点提炼
提炼核心差异化USP（Unique Selling Proposition），列出3-5个核心卖点`;

  const res = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = res.content[0].type === 'text' ? res.content[0].text : '';
  const sections = text.split('## ');
  return {
    productAnalysis: sections.find(s => s.startsWith('商品分析'))?.replace('商品分析\n', '') || text,
    bulletAnalysis: sections.find(s => s.startsWith('五点分析'))?.replace('五点分析\n', '') || '',
    uspExtraction: sections.find(s => s.startsWith('卖点提炼'))?.replace('卖点提炼\n', '') || '',
  };
}

// COSMO 评分: 标题COSMO评分 9项检测 0-100分 + 等级
async function cosmoScoring(title: string, bullets: string[], claudeKey: string, claudeUrl?: string) {
  const client = new Anthropic({ apiKey: claudeKey, ...(claudeUrl && { baseURL: claudeUrl }) });

  const prompt = `你是Amazon COSMO评分系统专家。请对以下Listing进行COSMO评分（0-100分）。

标题: ${title}
Bullets: ${bullets.join(' | ')}

评分维度（9项）：
1. 关键词相关性 (0-12分)
2. 搜索意图匹配 (0-12分)
3. 产品属性完整性 (0-11分)
4. 用户场景覆盖 (0-11分)
5. 语义丰富度 (0-11分)
6. 竞品差异化 (0-11分)
7. 购买意图触发 (0-11分)
8. 长尾词覆盖 (0-11分)
9. 品牌一致性 (0-10分)

请输出JSON格式：
{"total_score": 数字, "grade": "A/B/C/D", "details": [{"dimension": "名称", "score": 数字, "comment": "评语"}]}`;

  const res = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = res.content[0].type === 'text' ? res.content[0].text : '';
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return { score: parsed.total_score, details: text };
    }
  } catch {}
  return { score: 0, details: text };
}

// Rufus 模拟: 模拟买家Q&A，无需亚马逊官方API
async function rufusSimulation(input: AnalysisInput, claudeKey: string, claudeUrl?: string) {
  const client = new Anthropic({ apiKey: claudeKey, ...(claudeUrl && { baseURL: claudeUrl }) });

  const prompt = `你是Amazon Rufus AI助手的模拟器。基于以下商品信息，模拟买家可能会问的问题，并生成专业回答。

商品: ${input.title}
特点: ${input.bullets.join('; ')}

请生成5-8个买家常见问题及回答，格式：
Q: 问题
A: 回答

同时预测可能的负面问题并给出应对建议。`;

  const res = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 3000,
    messages: [{ role: 'user', content: prompt }],
  });

  return res.content[0].type === 'text' ? res.content[0].text : '';
}

// 卖家精灵 API: 获取Top SIF关键词列表
async function fetchSellerSpriteKeywords(asin: string, marketplace: string): Promise<string[]> {
  const apiKey = await getApiKey('seller_sprite');
  if (!apiKey) return [];

  try {
    const res = await fetch(`https://api.sellersprite.com/v1/product/keywords?asin=${asin}&marketplace=${marketplace}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    const data = await res.json() as any;
    return (data.keywords || []).map((k: any) => k.keyword).slice(0, 50);
  } catch {
    return [];
  }
}

// Sorftime API: 搜索量/趋势数据
async function fetchSorftimeData(asin: string, marketplace: string): Promise<string> {
  const apiKey = await getApiKey('sorftime');
  if (!apiKey) return '';

  try {
    const res = await fetch(`https://api.sorftime.com/v1/product/trend?asin=${asin}&market=${marketplace}`, {
      headers: { 'X-API-Key': apiKey },
    });
    const data = await res.json();
    return JSON.stringify(data);
  } catch {
    return '';
  }
}

// 数据洞察: SIF词覆盖/竞品对比
async function dataInsights(keywords: string[], title: string, bullets: string[], claudeKey: string, claudeUrl?: string): Promise<string> {
  if (keywords.length === 0) return '';
  const client = new Anthropic({ apiKey: claudeKey, ...(claudeUrl && { baseURL: claudeUrl }) });

  const listingText = `${title} ${bullets.join(' ')}`.toLowerCase();
  const covered = keywords.filter(k => listingText.includes(k.toLowerCase()));
  const missing = keywords.filter(k => !listingText.includes(k.toLowerCase()));

  const prompt = `SIF关键词覆盖分析：
已覆盖 (${covered.length}/${keywords.length}): ${covered.slice(0, 20).join(', ')}
未覆盖 (${missing.length}): ${missing.slice(0, 20).join(', ')}

请给出优化建议，哪些高价值关键词应该加入listing。`;

  const res = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });
  return res.content[0].type === 'text' ? res.content[0].text : '';
}

// Main analysis orchestrator
export async function runFullAnalysis(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { scrapeData: true },
  });
  if (!project?.scrapeData) throw new Error('No scrape data available');

  const claudeKey = await getApiKey('claude') || 'hermes2024';
  const claudeUrl = await getApiKey('claude_url') || 'http://127.0.0.1:8000';

  const input: AnalysisInput = {
    title: project.scrapeData.title || '',
    bullets: project.scrapeData.bullets,
    description: project.scrapeData.description || '',
    imageUrls: project.scrapeData.imageUrls,
  };

  // Run analyses in parallel
  const [claude, cosmo, rufus, sifKeywords] = await Promise.all([
    claudeProductAnalysis(input, claudeKey, claudeUrl),
    cosmoScoring(input.title, input.bullets, claudeKey, claudeUrl),
    rufusSimulation(input, claudeKey, claudeUrl),
    fetchSellerSpriteKeywords(project.asin || '', project.marketplace || 'US'),
  ]);

  const [sorftimeData, insights] = await Promise.all([
    fetchSorftimeData(project.asin || '', project.marketplace || 'US'),
    dataInsights(sifKeywords, input.title, input.bullets, claudeKey, claudeUrl),
  ]);

  const analysisData = {
    projectId,
    productAnalysis: claude.productAnalysis,
    bulletAnalysis: claude.bulletAnalysis,
    uspExtraction: claude.uspExtraction,
    cosmoScore: cosmo.score,
    cosmoDetails: cosmo.details,
    rufusQA: rufus,
    dataInsights: insights,
    sifKeywords,
    sorftimeData,
  };

  const existing = await prisma.analysis.findUnique({ where: { projectId } });
  if (existing) {
    return prisma.analysis.update({ where: { id: existing.id }, data: analysisData });
  }
  return prisma.analysis.create({ data: analysisData });
}
