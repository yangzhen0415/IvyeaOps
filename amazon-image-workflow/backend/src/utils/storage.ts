import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuid } from 'uuid';

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY || '',
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_KEY || '',
  },
});

const BUCKET = process.env.CLOUDFLARE_R2_BUCKET || 'amazon-workflow-images';

export async function uploadImage(buffer: Buffer, ext: string = 'png'): Promise<string> {
  const key = `images/${uuid()}.${ext}`;
  await r2.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: `image/${ext}`,
  }));
  return `https://${BUCKET}.r2.dev/${key}`;
}

export async function getImage(key: string): Promise<Buffer> {
  const res = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const chunks: Uint8Array[] = [];
  for await (const chunk of res.Body as any) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
