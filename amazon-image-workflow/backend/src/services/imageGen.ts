import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import { getApiKey } from '../routes/settings.js';
import { uploadImage } from '../utils/storage.js';

const prisma = new PrismaClient();

// Image size mapping per type
const SIZE_MAP: Record<string, { size: string; label: string }> = {
  main_1x1: { size: '1024x1024', label: '主图 1:1' },
  aplus_header: { size: '1536x1024', label: 'A+ 顶部横幅' },
  aplus_standard: { size: '1024x1024', label: 'A+ 标准/多栏' },
  brand_story: { size: '1536x1024', label: '品牌故事/大图' },
};

export async function generateImage(
  projectId: string,
  promptId: string,
  imageType: string
): Promise<string> {
  const openaiKey = await getApiKey('openai');
  if (!openaiKey) throw new Error('OpenAI API key not configured');

  const prompt = await prisma.prompt.findUnique({ where: { id: promptId } });
  if (!prompt) throw new Error('Prompt not found');

  const config = SIZE_MAP[imageType] || SIZE_MAP.main_1x1;
  const openaiUrl = await getApiKey('openai_url');
  const client = new OpenAI({
    apiKey: openaiKey,
    ...(openaiUrl && { baseURL: openaiUrl }),
  });

  const response = await client.images.generate({
    model: 'gpt-image-2',
    prompt: prompt.content,
    n: 1,
    size: config.size as any,
    quality: 'hd',
  });

  const imageData = response.data[0];
  if (!imageData.b64_json) throw new Error('No image data returned');

  // Upload to Cloudflare R2
  const buffer = Buffer.from(imageData.b64_json, 'base64');
  const url = await uploadImage(buffer, 'png');

  // Save to DB
  await prisma.generatedImage.create({
    data: {
      projectId,
      type: imageType,
      promptId,
      url,
      size: config.size,
    },
  });

  return url;
}

// Batch generate all images for a project
export async function generateAllImages(projectId: string): Promise<string[]> {
  const prompts = await prisma.prompt.findMany({
    where: { projectId },
    orderBy: { order: 'asc' },
  });

  const urls: string[] = [];
  for (const prompt of prompts) {
    const imageType = promptTypeToImageType(prompt.type, prompt.order);
    try {
      const url = await generateImage(projectId, prompt.id, imageType);
      urls.push(url);
    } catch (err) {
      console.error(`Failed to generate image for prompt ${prompt.id}:`, err);
    }
  }
  return urls;
}

function promptTypeToImageType(type: string, order: number): string {
  switch (type) {
    case 'main_image': return 'main_1x1';
    case 'aplus_type':
      if (order <= 4) return 'aplus_header';
      return 'aplus_standard';
    case 'brand_story': return 'brand_story';
    default: return 'main_1x1';
  }
}
