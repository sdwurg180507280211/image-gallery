import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imagesDirectory = path.join(root, 'images');
const outputDirectory = path.join(root, 'data');
const outputFile = path.join(outputDirectory, 'gallery.json');
const imageExtensions = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.webp']);

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

  return {
    id: metadata.id || createHash('sha1').update(relativePath).digest('hex').slice(0, 12),
    path: relativePath,
    title: metadata.title || titleFromFilename(absolutePath),
    category: metadata.category || folderParts[0] || '未分类',
    description: metadata.description || '',
    tags,
    createdAt,
    featured: Boolean(metadata.featured),
    width: Number(metadata.width) || undefined,
    height: Number(metadata.height) || undefined,
  };
}

async function main() {
  const allFiles = await walk(imagesDirectory);
  const imageFiles = allFiles.filter((file) => imageExtensions.has(path.extname(file).toLowerCase()));
  const images = await Promise.all(imageFiles.map(createRecord));

  images.sort((a, b) => {
    const featuredDifference = Number(b.featured) - Number(a.featured);
    if (featuredDifference) return featuredDifference;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    count: images.length,
    images,
  };

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`已生成 ${images.length} 张图片的索引：${toPosix(path.relative(root, outputFile))}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
