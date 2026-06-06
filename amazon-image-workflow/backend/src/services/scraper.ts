import { PrismaClient } from '@prisma/client';
import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getApiKey } from '../routes/settings.js';

const execFileP = promisify(execFile);

const prisma = new PrismaClient();

interface ScrapeResult {
  title: string;
  bullets: string[];
  description: string;
  imageUrls: string[];
}

// Realistic browser UA — full string (Chrome on Windows). Bare "Mozilla/5.0 ... AppleWebKit/537.36"
// without the (KHTML, like Gecko) Chrome/x Safari/537.36 suffix is itself a bot signal on Amazon.
const REAL_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Scrape via Rainforest API (preferred) or fallback to fetch+cheerio, then puppeteer as last resort.
export async function scrapeAmazonListing(projectId: string): Promise<ScrapeResult> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project?.asin) throw new Error('No ASIN set for project');

  const marketplace = project.marketplace || 'US';

  // 1) Rainforest API (paid, most reliable)
  const rainforestKey = await getApiKey('rainforest');
  if (rainforestKey) {
    try {
      return await scrapeViaRainforest(project.asin, marketplace, rainforestKey);
    } catch (err) {
      console.warn('[scraper] rainforest failed, falling back to fetch:', (err as Error).message);
    }
  }

  // 2) curl subprocess + cheerio (preferred unpaid path).
  //
  //    Node's built-in fetch (undici) sets a default header set whose JA3/JA4 TLS fingerprint
  //    triggers Amazon's anti-bot — every undici request to /dp/{ASIN} returns a 5KB challenge
  //    page even with a perfect UA. curl with the same UA returns the full ~1.8MB product page.
  //    Spawning curl avoids the fingerprint problem entirely.
  try {
    const result = await scrapeViaCurl(project.asin, marketplace);
    if (result.title || result.imageUrls.length > 0) {
      return result;
    }
    console.warn('[scraper] curl returned empty result, trying puppeteer');
  } catch (err) {
    console.warn('[scraper] curl failed, trying puppeteer:', (err as Error).message);
  }

  // 3) Puppeteer as last resort
  return scrapeViaPuppeteer(project.asin, marketplace);
}

async function scrapeViaRainforest(
  asin: string,
  marketplace: string,
  apiKey: string,
): Promise<ScrapeResult> {
  const domain = marketplaceDomain(marketplace);
  const url = `https://api.rainforestapi.com/request?api_key=${apiKey}&type=product&asin=${asin}&amazon_domain=${domain}`;
  const res = await fetch(url);
  const data = (await res.json()) as any;
  const product = data.product;

  return {
    title: product?.title || '',
    bullets: (product?.feature_bullets || []).slice(0, 5),
    description: product?.description || '',
    imageUrls: (product?.images || []).map((img: any) => img.link).slice(0, 7),
  };
}

async function scrapeViaCurl(asin: string, marketplace: string): Promise<ScrapeResult> {
  const domain = marketplaceDomain(marketplace);
  const url = `https://www.${domain}/dp/${asin}`;

  // Use curl as a subprocess — its TLS fingerprint is accepted by Amazon while undici's is not.
  // Args passed as an array (no shell), so the URL/UA are not interpolated into a shell command.
  const args = [
    '-sS',
    '--max-time', '25',
    '--compressed', // auto-decompress gzip/deflate/br
    '-A', REAL_UA,
    url,
  ];

  let stdout: string;
  try {
    const r = await execFileP('curl', args, {
      maxBuffer: 25 * 1024 * 1024, // Amazon product pages are ~1-2 MB
    });
    stdout = r.stdout;
  } catch (err: any) {
    throw new Error(`curl failed: ${err.message || err}`);
  }

  if (!stdout || stdout.length < 50_000) {
    throw new Error(`curl response too small (${stdout?.length ?? 0} bytes) — likely anti-bot page`);
  }
  if (
    /Type the characters you see in this image/i.test(stdout) ||
    /Sorry, we just need to make sure you're not a robot/i.test(stdout)
  ) {
    throw new Error('curl hit anti-bot/captcha page');
  }

  return parseAmazonHtml(stdout);
}

function parseAmazonHtml(html: string): ScrapeResult {
  const $ = cheerio.load(html);

  const title = $('#productTitle').first().text().trim();

  // Bullet points: skip hidden ones (e.g. SEO seasonal / aok-hidden) and meta items.
  const bullets: string[] = [];
  $('#feature-bullets ul li').each((_, el) => {
    const $el = $(el);
    if ($el.hasClass('aok-hidden')) return;
    if ($el.attr('id') === 'replacementPartsFitmentBulletInner') return;
    const text = $el.find('span.a-list-item').first().text().replace(/\s+/g, ' ').trim();
    if (text) bullets.push(text);
  });

  let description = $('#productDescription').text().replace(/\s+/g, ' ').trim();
  if (!description) {
    description = $('#productDescription_feature_div').text().replace(/\s+/g, ' ').trim();
  }

  // Images: Amazon's reliable source is the inline JSON inside the page (colorImages /
  // imageBlockBTF) which exposes "hiRes":"https://..." entries. The DOM #altImages thumbnails
  // are populated by JS post-load and aren't present in the static HTML.
  const imageUrls: string[] = [];
  const seen = new Set<string>();
  const hiResRegex = /"hiRes"\s*:\s*"(https?:\/\/[^"\\]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = hiResRegex.exec(html)) !== null) {
    const url = m[1];
    if (!seen.has(url)) {
      seen.add(url);
      imageUrls.push(url);
    }
    if (imageUrls.length >= 7) break;
  }

  // Fallback: try "large" images if no hiRes found
  if (imageUrls.length === 0) {
    const largeRegex = /"large"\s*:\s*"(https?:\/\/[^"\\]+)"/g;
    while ((m = largeRegex.exec(html)) !== null) {
      const url = m[1];
      if (!seen.has(url)) {
        seen.add(url);
        imageUrls.push(url);
      }
      if (imageUrls.length >= 7) break;
    }
  }

  // Final fallback: landing image only
  if (imageUrls.length === 0) {
    const landing = $('#landingImage').attr('data-old-hires') || $('#landingImage').attr('src');
    if (landing) imageUrls.push(landing);
  }

  return {
    title,
    bullets: bullets.slice(0, 5),
    description,
    imageUrls,
  };
}

async function scrapeViaPuppeteer(asin: string, marketplace: string): Promise<ScrapeResult> {
  const domain = marketplaceDomain(marketplace);
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(REAL_UA);
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

    await page.goto(`https://www.${domain}/dp/${asin}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    const html = await page.content();
    return parseAmazonHtml(html);
  } finally {
    await browser.close();
  }
}

function marketplaceDomain(marketplace: string): string {
  const map: Record<string, string> = {
    US: 'amazon.com',
    UK: 'amazon.co.uk',
    DE: 'amazon.de',
    JP: 'amazon.co.jp',
    FR: 'amazon.fr',
    IT: 'amazon.it',
    ES: 'amazon.es',
    CA: 'amazon.ca',
    AU: 'amazon.com.au',
  };
  return map[marketplace] || 'amazon.com';
}

// Save scrape results to DB
export async function saveScrapeData(projectId: string, data: ScrapeResult) {
  const existing = await prisma.scrapeData.findUnique({ where: { projectId } });
  if (existing) {
    return prisma.scrapeData.update({ where: { id: existing.id }, data });
  }
  return prisma.scrapeData.create({ data: { projectId, ...data } });
}
