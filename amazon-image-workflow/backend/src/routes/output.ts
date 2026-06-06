import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { getImage } from '../utils/storage.js';
import archiver from 'archiver';

const router = Router();
const prisma = new PrismaClient();

// Batch download all images as ZIP
router.get('/:projectId/download', async (req, res) => {
  const images = await prisma.generatedImage.findMany({
    where: { projectId: req.params.projectId },
  });
  if (!images.length) return res.status(404).json({ error: 'No images found' });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename=project-${req.params.projectId}.zip`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(res);

  for (const img of images) {
    try {
      const key = img.url.split('/').slice(-2).join('/');
      const buffer = await getImage(key);
      archive.append(buffer, { name: `${img.type}_${img.id.slice(0, 8)}.png` });
    } catch {}
  }

  await archive.finalize();
});

// Save as template
router.post('/:projectId/save-template', async (req, res) => {
  const { name, category } = req.body;
  const prompts = await prisma.prompt.findMany({
    where: { projectId: req.params.projectId },
    orderBy: { order: 'asc' },
  });

  const template = await prisma.template.create({
    data: {
      name: name || `Template ${Date.now()}`,
      category: category || 'general',
      content: JSON.stringify(prompts.map(p => ({ type: p.type, content: p.content }))),
    },
  });
  res.json(template);
});

// List templates
router.get('/templates/list', async (_req, res) => {
  const templates = await prisma.template.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(templates);
});

// Apply template to project
router.post('/:projectId/apply-template', async (req, res) => {
  const { templateId } = req.body;
  const template = await prisma.template.findUnique({ where: { id: templateId } });
  if (!template) return res.status(404).json({ error: 'Template not found' });

  const promptData = JSON.parse(template.content) as { type: string; content: string }[];
  await prisma.prompt.deleteMany({ where: { projectId: req.params.projectId } });

  for (let i = 0; i < promptData.length; i++) {
    await prisma.prompt.create({
      data: {
        projectId: req.params.projectId,
        type: promptData[i].type,
        content: promptData[i].content,
        order: i + 1,
      },
    });
  }
  res.json({ success: true });
});

export default router;
