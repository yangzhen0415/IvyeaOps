import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { encrypt, decrypt } from '../utils/encryption.js';

const router = Router();
const prisma = new PrismaClient();

// Get all API key names (not values)
router.get('/', async (_req, res) => {
  const keys = await prisma.apiKey.findMany({ select: { id: true, name: true, updatedAt: true } });
  res.json(keys);
});

// Save/update an API key
router.post('/', async (req, res) => {
  const { name, value } = req.body;
  if (!name || !value) return res.status(400).json({ error: 'name and value required' });

  const { encrypted, iv } = encrypt(value);
  const existing = await prisma.apiKey.findFirst({ where: { name } });

  if (existing) {
    await prisma.apiKey.update({ where: { id: existing.id }, data: { encrypted, iv } });
  } else {
    await prisma.apiKey.create({ data: { name, encrypted, iv } });
  }
  res.json({ success: true });
});

// Delete an API key
router.delete('/:id', async (req, res) => {
  await prisma.apiKey.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

// Internal helper: get decrypted key by name
export async function getApiKey(name: string): Promise<string | null> {
  const key = await prisma.apiKey.findFirst({ where: { name } });
  if (!key) return null;
  return decrypt(key.encrypted, key.iv);
}

export default router;
