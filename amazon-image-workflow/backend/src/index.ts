import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import settingsRouter from './routes/settings.js';
import projectsRouter from './routes/projects.js';
import scrapeRouter from './routes/scrape.js';
import analysisRouter from './routes/analysis.js';
import promptsRouter from './routes/prompts.js';
import imagesRouter from './routes/images.js';
import outputRouter from './routes/output.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Layer 0: Settings - API Key management
app.use('/api/settings', settingsRouter);
// Layer 1: Data Input - Projects/ASIN/Upload
app.use('/api/projects', projectsRouter);
// Layer 2: Scraping
app.use('/api/scrape', scrapeRouter);
// Layer 3: AI Analysis
app.use('/api/analysis', analysisRouter);
// Layer 4: Prompt Engine
app.use('/api/prompts', promptsRouter);
// Layer 5: Image Generation
app.use('/api/images', imagesRouter);
// Output: Download/Save/Export
app.use('/api/output', outputRouter);

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
