import { Router } from 'express';
import { runFullAnalysis } from '../services/analysis.js';

const router = Router();

router.post('/:projectId', async (req, res) => {
  try {
    const result = await runFullAnalysis(req.params.projectId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
