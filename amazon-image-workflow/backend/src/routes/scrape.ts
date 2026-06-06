import { Router } from 'express';
import { scrapeAmazonListing, saveScrapeData } from '../services/scraper.js';

const router = Router();

// Trigger scraping for a project
router.post('/:projectId', async (req, res) => {
  try {
    const data = await scrapeAmazonListing(req.params.projectId);
    const saved = await saveScrapeData(req.params.projectId, data);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
