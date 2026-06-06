import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { generateImage, generateAllImages } from '../services/imageGen.js';

const router = Router();
const prisma = new PrismaClient();

// Generate single image
router.post('/:projectId/single', async (req, res) => {
  const { promptId, imageType } = req.body;
  try {
    const url = await generateImage(req.params.projectId, promptId, imageType);
    res.json({ url });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Generate all images for a project
router.post('/:projectId/all', async (req, res) => {
  try {
    const urls = await generateAllImages(req.params.projectId);
    res.json({ urls });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get generated images for a project
router.get('/:projectId', async (req, res) => {
  const images = await prisma.generatedImage.findMany({
    where: { projectId: req.params.projectId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(images);
});

export default router;
