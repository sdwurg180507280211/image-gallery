import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { access, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imagesDirectory = path.join(root, 'images');
const outputDirectory = path.join(root, 'data');
const outputFile = path.join(outputDirectory, 'gallery.json');
const thumbnailCacheDirectory = path.join(root, '.cache', 'thumbnails');
const thumbnailPublicDirectory = 'generated/thumbnails';
const thumbnailWidth = 640;
const thumbnailQuality = 78;
const imageExtensions = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.webp']);
const usedThumbnailNames = new Set();
const thumbnailJobs = new Map();
const thumbnailStats = { generated: 0, reused: 0, failed: 0, removed: 0 };

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function titleFromFilename(filename) {
  return path
    .basename(filename, path.extname(filename))
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function walk(directory) {
  let entries = [];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const files = await Promise.all(entries.map(async (entry) => {
    if (entry.name.startsWith('.')) return [];
    const absolutePath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolutePath) : [absolutePath];
  }));
  return files.flat();
}

async function readMetadata(imagePath) {
  const sidecarPath = imagePath.replace(/\.[^.]+$/, '.json');
  try {
    return JSON.parse(await readFile(sidecarPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    console.warn(`忽略无效元数据：${toPosix(path.relative(root, sidecarPath))}`);
    return {};
  }
}

function getGitCreatedAt(relativePath) {
  try {
    return execFileSync(
      'git',
      ['log', '--follow', '--diff-filter=A', '--format=%aI', '-1', '--', relativePath],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
  } catch {
    return '';
  }
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function createThumbnailKey(absolutePath) {
  const bytes = await readFile(absolutePath);
  return createHash('sha256')
    .update(`thumbnail-v1|width=${thumbnailWidth}|quality=${thumbnailQuality}|`)
    .update(bytes)
    .digest('hex');
}

function orientedDimensions(metadata) {
  const width = Number(metadata.width) || 0;
  const height = Number(metadata.height) || 0;
  return [5, 6, 7, 8].includes(metadata.orientation)
    ? { width: height, height: width }
    : { width, height };
}

async function generateThumbnail(absolutePath, cachePath) {
  const temporaryPath = `${cachePath}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  try {
    await sharp(absolutePath, { animated: false, failOn: 'none' })
      .rotate()
      .resize({ width: thumbnailWidth, withoutEnlargement: true })
      .webp({ quality: thumbnailQuality, effort: 4, smartSubsample: true })
      .toFile(temporaryPath);
    await rename(temporaryPath, cachePath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

async function ensureThumbnail(absolutePath, thumbnailName) {
  if (thumbnailJobs.has(thumbnailName)) return thumbnailJobs.get(thumbnailName);

  const job = (async () => {
    const cachePath = path.join(thumbnailCacheDirectory, thumbnailName);
    if (await fileExists(cachePath)) {
      thumbnailStats.reused += 1;
      return;
    }
    await generateThumbnail(absolutePath, cachePath);
    thumbnailStats.generated += 1;
  })();

  thumbnailJobs.set(thumbnailName, job);
  return job;
}

async function createRecord(absolutePath) {
  const relativePath = toPosix(path.relative(root, absolutePath));
  const relativeToImages = toPosix(path.relative(imagesDirectory, absolutePath));
  const folder = path.posix.dirname(relativeToImages);
  const folderParts = folder === '.' ? [] : folder.split('/').filter(Boolean);
  const metadata = await readMetadata(absolutePath);
  const fileStats = await stat(absolutePath);
  const automaticTags = folderParts.slice(1);
  const metadataTags = Array.isArray(metadata.tags) ? metadata.tags : [];
  const tags = [...new Set([...automaticTags, ...metadataTags].map(String).filter(Boolean))];
  const createdAt = metadata.createdAt || metadata.date || getGitCreatedAt(relativePath) || fileStats.mtime.toISOString();

  let sourceDimensions = { width: Number(metadata.width) || 0, height: Number(metadata.height) || 0 };
  let thumbnail = relativePath;

  try {
    const sourceMetadata = await sharp(absolutePath, { animated: false, failOn: 'none' }).metadata();
    sourceDimensions = orientedDimensions(sourceMetadata);
    const thumbnailKey = await createThumbnailKey(absolutePath);
    const thumbnailName = `${thumbnailKey.slice(0, 32)}.webp`;
    usedThumbnailNames.add(thumbnailName);
    await ensureThumbnail(absolutePath, thumbnailName);
    thumbnail = `${thumbnailPublicDirectory}/${thumbnailName}`;
  } catch (error) {
    thumbnailStats.failed += 1;
    console.warn(`缩略图生成失败，将使用原图：${relativePath}（${error.message}）`);
  }

  return {
    id: metadata.id || createHash('sha1').update(relativePath).digest('hex').slice(0, 12),
    path: relativePath,
    thumbnail,
    title: metadata.title || titleFromFilename(absolutePath),
    category: metadata.category || folderParts[0] || '未分类',
    description: metadata.description || '',
    tags,
    createdAt,
    featured: Boolean(metadata.featured),
    width: sourceDimensions.width || Number(metadata.width) || undefined,
    height: sourceDimensions.height || Number(metadata.height) || undefined,
  };
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  const workerCount = Math.min(concurrency, Math.max(items.length, 1));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

async function removeUnusedThumbnails() {
  let entries = [];
  try {
    entries = await readdir(thumbnailCacheDirectory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }

  await Promise.all(entries.map(async (entry) => {
    if (!entry.isFile() || usedThumbnailNames.has(entry.name)) return;
    await rm(path.join(thumbnailCacheDirectory, entry.name), { force: true });
    thumbnailStats.removed += 1;
  }));
}

async function main() {
  await mkdir(outputDirectory, { recursive: true });
  await mkdir(thumbnailCacheDirectory, { recursive: true });

  const allFiles = await walk(imagesDirectory);
  const imageFiles = allFiles.filter((file) => imageExtensions.has(path.extname(file).toLowerCase()));
  const images = await mapWithConcurrency(imageFiles, 4, createRecord);

  images.sort((a, b) => {
    const featuredDifference = Number(b.featured) - Number(a.featured);
    if (featuredDifference) return featuredDifference;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  await removeUnusedThumbnails();

  const payload = {
    generatedAt: new Date().toISOString(),
    count: images.length,
    thumbnail: {
      width: thumbnailWidth,
      format: 'webp',
      quality: thumbnailQuality,
    },
    images,
  };

  await writeFile(outputFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`已生成 ${images.length} 张图片的索引：${toPosix(path.relative(root, outputFile))}`);
  console.log(`缩略图：新生成 ${thumbnailStats.generated}，复用 ${thumbnailStats.reused}，失败 ${thumbnailStats.failed}，清理 ${thumbnailStats.removed}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
