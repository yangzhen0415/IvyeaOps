import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { generatePrompts } from '../services/promptEngine.js';

const router = Router();
const prisma = new PrismaClient();

// Generate prompts for a project
router.post('/:projectId/generate', async (req, res) => {
  try {
    await generatePrompts(req.params.projectId);
    const prompts = await prisma.prompt.findMany({
      where: { projectId: req.params.projectId },
      orderBy: { order: 'asc' },
    });
    res.json(prompts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get prompts for a project
router.get('/:projectId', async (req, res) => {
  const prompts = await prisma.prompt.findMany({
    where: { projectId: req.params.projectId },
    orderBy: { order: 'asc' },
  });
  res.json(prompts);
});

// Update a prompt manually
router.put('/:id', async (req, res) => {
  const { content } = req.body;
  const prompt = await prisma.prompt.update({ where: { id: req.params.id }, data: { content } });
  res.json(prompt);
});

export default router;
