import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const galleryPath = path.join(root, 'data', 'gallery.json');
const cacheDirectory = path.join(root, '.cache', 'landscape-thumbnails');
const publicDirectory = 'generated/landscape-thumbnails';
const landscapeWidth = 1280;
const panoramaWidth = 1920;
const landscapeQuality = 84;
const panoramaQuality = 82;
const landscapeThreshold = 1.15;
const panoramaThreshold = 2.15;
const concurrency = 4;

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function previewSpec(record) {
  const width = Number(record.width) || 0;
  const height = Number(record.height) || 0;
  if (!(width > 640 && height > 0)) return null;

  const ratio = width / height;
  if (ratio >= panoramaThreshold) {
    return { width: panoramaWidth, quality: panoramaQuality, kind: 'panorama' };
  }
  if (ratio >= landscapeThreshold) {
    return { width: landscapeWidth, quality: landscapeQuality, kind: 'landscape' };
  }
  return null;
}

function thumbnailName(record, spec) {
  const identity = record.sourceSha256 || record.path;
  const digest = createHash('sha256')
    .update(`landscape-preview-v1|kind=${spec.kind}|width=${spec.width}|quality=${spec.quality}|${identity}`)
    .digest('hex')
    .slice(0, 32);
  return `${digest}.webp`;
}

async function generatePreview(sourcePath, outputPath, spec) {
  const temporaryPath = `${outputPath}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  try {
    await sharp(sourcePath, { animated: false, failOn: 'none' })
      .rotate()
      .resize({ width: spec.width, withoutEnlargement: true })
      .webp({ quality: spec.quality, effort: 4, smartSubsample: true })
      .toFile(temporaryPath);
    await rename(temporaryPath, outputPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

async function mapWithConcurrency(items, limit, mapper) {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, Math.max(items.length, 1)) }, worker));
}

async function removeUnusedFiles(usedNames) {
  let entries = [];
  try {
    entries = await readdir(cacheDirectory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return 0;
    throw error;
  }

  let removed = 0;
  await Promise.all(entries.map(async (entry) => {
    if (!entry.isFile() || usedNames.has(entry.name)) return;
    await rm(path.join(cacheDirectory, entry.name), { force: true });
    removed += 1;
  }));
  return removed;
}

async function main() {
  const payload = JSON.parse(await readFile(galleryPath, 'utf8'));
  const records = Array.isArray(payload) ? payload : payload.images || [];
  const jobs = [];
  const usedNames = new Set();

  await mkdir(cacheDirectory, { recursive: true });

  for (const record of records) {
    delete record.thumbnailLarge;
    delete record.thumbnailLargeWidth;

    const spec = previewSpec(record);
    if (!spec) continue;

    const name = thumbnailName(record, spec);
    const sourcePath = path.join(root, String(record.path || ''));
    const outputPath = path.join(cacheDirectory, name);
    usedNames.add(name);
    jobs.push({ record, spec, name, sourcePath, outputPath });
  }

  let generated = 0;
  let reused = 0;
  await mapWithConcurrency(jobs, concurrency, async (job) => {
    if (!await fileExists(job.sourcePath)) {
      throw new Error(`横图原文件不存在：${job.record.path}`);
    }
    if (await fileExists(job.outputPath)) {
      reused += 1;
    } else {
      await generatePreview(job.sourcePath, job.outputPath, job.spec);
      generated += 1;
    }

    job.record.thumbnailLarge = `${publicDirectory}/${job.name}`;
    job.record.thumbnailLargeWidth = Math.min(Number(job.record.width) || job.spec.width, job.spec.width);
  });

  const removed = await removeUnusedFiles(usedNames);
  if (!Array.isArray(payload)) {
    payload.thumbnail = {
      ...(payload.thumbnail || {}),
      landscapeWidth,
      panoramaWidth,
      landscapeQuality,
      panoramaQuality,
    };
  }

  await writeFile(galleryPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`横图高清缩略图：目标 ${jobs.length}，新增 ${generated}，复用 ${reused}，清理 ${removed}。`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
