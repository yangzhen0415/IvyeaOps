import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import path from 'path';
import { uploadImage } from '../utils/storage.js';
import fs from 'fs';

const router = Router();
const prisma = new PrismaClient();
const upload = multer({ dest: '/tmp/uploads/' });

// Create a new project with ASIN + marketplace
router.post('/', async (req, res) => {
  const { asin, marketplace, link1688 } = req.body;
  const project = await prisma.project.create({
    data: { asin, marketplace, link1688 },
  });
  res.json(project);
});

// Get project by ID
router.get('/:id', async (req, res) => {
  const project = await prisma.project.findUnique({
    where: { id: req.params.id },
    include: { scrapeData: true, analysis: true, prompts: true, images: true },
  });
  if (!project) return res.status(404).json({ error: 'not found' });
  res.json(project);
});

// List all projects
router.get('/', async (_req, res) => {
  const projects = await prisma.project.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  res.json(projects);
});

// Upload local images (drag & drop)
router.post('/:id/upload', upload.array('images', 10), async (req, res) => {
  const projectId = req.params.id as string;
  const files = req.files as Express.Multer.File[];
  const urls: string[] = [];

  for (const file of files) {
    const buffer = fs.readFileSync(file.path);
    const ext = path.extname(file.originalname).slice(1) || 'png';
    const url = await uploadImage(buffer, ext);
    urls.push(url);
    fs.unlinkSync(file.path);
  }

  // Store uploaded images in scrape data
  const existing = await prisma.scrapeData.findUnique({ where: { projectId } });
  if (existing) {
    await prisma.scrapeData.update({
      where: { id: existing.id },
      data: { imageUrls: [...existing.imageUrls, ...urls] },
    });
  } else {
    await prisma.scrapeData.create({
      data: { projectId, imageUrls: urls },
    });
  }
  res.json({ urls });
});

export default router;
