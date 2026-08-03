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
const validationFile = path.join(outputDirectory, 'validation-report.json');
const taxonomyFile = path.join(outputDirectory, 'taxonomy-v2.json');
const thumbnailCacheDirectory = path.join(root, '.cache', 'thumbnails');
const thumbnailPublicDirectory = 'generated/thumbnails';
const thumbnailWidth = 640;
const thumbnailQuality = 78;
const imageExtensions = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.webp']);
const usedThumbnailNames = new Set();
const thumbnailJobs = new Map();
const thumbnailStats = { generated: 0, reused: 0, failed: 0, removed: 0 };

const legacySceneFolders = new Map([
  ['snow', 'snow'], ['desert', 'desert'], ['desert-oasis', 'desert-oasis'],
  ['palace', 'palace'], ['cloud-palace', 'cloud-palace'], ['night-palace', 'night-palace'],
  ['flower-garden', 'flower-garden'], ['spring-garden', 'spring-garden'],
  ['waterfront', 'waterfront'], ['lotus-pond', 'lotus-pond'], ['moon-water', 'moon-water'],
  ['moon-night', 'moon-night'], ['rain-night', 'rain-night'], ['night-city', 'night-city'],
  ['wuxia', 'bamboo-forest'], ['phoenix', 'phoenix'], ['festival', 'festival'],
]);
const legacyPaletteFolders = new Map([
  ['emerald', 'emerald-gold'], ['violet', 'violet-gold'], ['pink-gold', 'pink-gold'],
]);
const legacyThemeFolders = new Map([
  ['portrait', 'portrait'], ['fantasy-portrait', 'portrait'], ['battle', 'battle'],
  ['magic', 'magic'], ['fire-magic', 'fire-magic'], ['celestial', 'celestial'],
  ['wuxia', 'wuxia'], ['festival', 'festival'],
]);
const compositionTagMap = new Map([
  ['独立大图', 'single-image'], ['人物特写', 'close-up'], ['特写', 'close-up'],
  ['胸像', 'bust'], ['半身', 'half-body'], ['全身', 'full-body'], ['全身构图', 'full-body'],
  ['多格拼图', 'multi-panel'], ['五宫格', 'five-panel'], ['五联画', 'five-panel'],
  ['六宫格', 'six-panel'], ['十宫格', 'ten-panel'], ['十格拼图', 'ten-panel'],
  ['角色设定展示', 'character-turnaround'],
]);
const knownActionTags = new Set([
  '回眸', '回眸凝视', '静坐', '伸手互动', '直视镜头', '托腮', '持剑', '战斗动作',
  '魔法召唤', '托举能量球', '舞蹈', '浮空', '执扇', '闭眼', '侧面', '静态姿态',
]);
const knownExpressionTags = new Set(['清冷', '魅惑', '妩媚', '温柔', '凌厉', '神秘', '冷静', '凝视']);

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function titleFromFilename(filename) {
  return path.basename(filename, path.extname(filename)).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeList(value) {
  const source = Array.isArray(value) ? value : value == null || value === '' ? [] : [value];
  return [...new Set(source.flatMap((item) => String(item).split(',')).map((item) => item.trim()).filter(Boolean))];
}

function addUnique(target, ...values) {
  values.flat().filter(Boolean).forEach((value) => {
    if (!target.includes(value)) target.push(value);
  });
  return target;
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

async function readJsonOptional(filePath, fallback = {}) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function readMetadata(imagePath, issues) {
  const sidecarPath = imagePath.replace(/\.[^.]+$/, '.json');
  try {
    return JSON.parse(await readFile(sidecarPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    issues.push({ severity: 'warning', code: 'invalid-sidecar-json', path: toPosix(path.relative(root, sidecarPath)), message: error.message });
    return {};
  }
}

function getGitCreatedAt(relativePath) {
  try {
    return execFileSync('git', ['log', '--follow', '--diff-filter=A', '--format=%aI', '-1', '--', relativePath], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

async function fileExists(filePath) {
  try { await access(filePath); return true; } catch { return false; }
}

async function fileSha256(absolutePath) {
  return createHash('sha256').update(await readFile(absolutePath)).digest('hex');
}

function thumbnailNameFor(sourceSha256) {
  return `${createHash('sha256').update(`thumbnail-v2|width=${thumbnailWidth}|quality=${thumbnailQuality}|${sourceSha256}`).digest('hex').slice(0, 32)}.webp`;
}

function orientedDimensions(metadata) {
  const width = Number(metadata.width) || 0;
  const height = Number(metadata.height) || 0;
  return [5, 6, 7, 8].includes(metadata.orientation) ? { width: height, height: width } : { width, height };
}

async function generateThumbnail(absolutePath, cachePath) {
  const temporaryPath = `${cachePath}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  try {
    await sharp(absolutePath, { animated: false, failOn: 'none' })
      .rotate().resize({ width: thumbnailWidth, withoutEnlargement: true })
      .webp({ quality: thumbnailQuality, effort: 4, smartSubsample: true }).toFile(temporaryPath);
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
    if (await fileExists(cachePath)) { thumbnailStats.reused += 1; return; }
    await generateThumbnail(absolutePath, cachePath);
    thumbnailStats.generated += 1;
  })();
  thumbnailJobs.set(thumbnailName, job);
  return job;
}

function taxonomyValues(taxonomy, dimension) {
  return new Set((taxonomy.dimensions?.[dimension] || []).map((item) => item.value));
}

function inferDimensions(metadata, folderParts, tags) {
  const folder = folderParts[1] || '';
  const theme = normalizeList(metadata.theme ?? metadata.themes);
  const scene = normalizeList(metadata.scene ?? metadata.scenes);
  const palette = normalizeList(metadata.palette ?? metadata.palettes);
  const composition = normalizeList(metadata.composition);
  const actions = normalizeList(metadata.actions);
  const expressions = normalizeList(metadata.expressions);
  const confirmedTraits = normalizeList(metadata.confirmedTraits);
  let assetType = String(metadata.assetType || '').trim();

  if (!theme.length && legacyThemeFolders.has(folder)) addUnique(theme, legacyThemeFolders.get(folder));
  if (!scene.length && legacySceneFolders.has(folder)) addUnique(scene, legacySceneFolders.get(folder));
  if (!palette.length && legacyPaletteFolders.has(folder)) addUnique(palette, legacyPaletteFolders.get(folder));

  if (folder === 'multi-panel') {
    addUnique(composition, 'multi-panel');
    assetType ||= 'collage';
  } else if (folder === 'character-sheet') {
    addUnique(composition, 'multi-panel', 'character-turnaround');
    assetType ||= 'character-sheet';
  } else if (folder === 'multi-theme') {
    addUnique(composition, 'multi-panel', 'mixed-shot');
    addUnique(theme, 'fantasy');
    assetType ||= 'collage';
  }

  for (const tag of tags) {
    if (compositionTagMap.has(tag)) addUnique(composition, compositionTagMap.get(tag));
    if (knownActionTags.has(tag)) addUnique(actions, tag);
    if (knownExpressionTags.has(tag)) addUnique(expressions, tag);
  }

  if (!assetType) assetType = composition.some((item) => ['multi-panel', 'five-panel', 'six-panel', 'ten-panel'].includes(item)) ? 'collage' : 'artwork';
  return { theme, scene, palette, composition, assetType, actions, expressions, confirmedTraits };
}

function validateRecord(record, taxonomy, metadata, issues) {
  const dimensions = ['theme', 'scene', 'palette', 'composition'];
  for (const dimension of dimensions) {
    const allowed = taxonomyValues(taxonomy, dimension);
    for (const value of record[dimension]) {
      if (!allowed.has(value)) issues.push({ severity: 'warning', code: `unknown-${dimension}`, path: record.path, value, message: `${dimension} 使用了未登记值：${value}` });
    }
  }
  const allowedAssetTypes = taxonomyValues(taxonomy, 'assetType');
  if (!allowedAssetTypes.has(record.assetType)) issues.push({ severity: 'warning', code: 'unknown-asset-type', path: record.path, value: record.assetType, message: `assetType 使用了未登记值：${record.assetType}` });

  const forbiddenThemes = new Set(taxonomy.rules?.forbiddenThemeValues || []);
  record.theme.filter((value) => forbiddenThemes.has(value)).forEach((value) => {
    issues.push({ severity: 'warning', code: 'mixed-theme-dimension', path: record.path, value, message: `主题字段混入颜色、构图或资产类型：${value}` });
  });

  const hasSingle = record.composition.includes('single-image');
  const hasMulti = record.composition.some((value) => ['multi-panel', 'five-panel', 'six-panel', 'ten-panel'].includes(value));
  if (hasSingle && hasMulti) issues.push({ severity: 'warning', code: 'composition-conflict', path: record.path, message: 'composition 同时包含独立大图与多格拼图，请视觉复核。' });
  if (record.assetType === 'artwork' && hasMulti) issues.push({ severity: 'warning', code: 'asset-composition-conflict', path: record.path, message: '普通作品被标记为多格构图，请确认 assetType。' });
  if (!metadata.id) issues.push({ severity: 'info', code: 'id-not-frozen-in-sidecar', path: record.path, message: '当前 ID 从旧索引继承；移动文件前应将 id 写入同名 JSON。' });

  for (const group of taxonomy.rules?.mutuallyExclusiveTraits || []) {
    const matched = group.filter((trait) => record.confirmedTraits.includes(trait));
    if (matched.length > 1) issues.push({ severity: 'warning', code: 'trait-conflict', path: record.path, values: matched, message: `confirmedTraits 存在互斥特征：${matched.join('、')}` });
  }
}

async function createRecord(absolutePath, context) {
  const { taxonomy, existingIdsByPath, issues } = context;
  const relativePath = toPosix(path.relative(root, absolutePath));
  const relativeToImages = toPosix(path.relative(imagesDirectory, absolutePath));
  const folder = path.posix.dirname(relativeToImages);
  const folderParts = folder === '.' ? [] : folder.split('/').filter(Boolean);
  const metadata = await readMetadata(absolutePath, issues);
  const fileStats = await stat(absolutePath);
  const metadataTags = Array.isArray(metadata.tags) ? metadata.tags.map(String).filter(Boolean) : [];
  const automaticTags = folderParts.slice(1);
  const dimensions = inferDimensions(metadata, folderParts, metadataTags);
  const character = String(metadata.character || metadata.category || folderParts[0] || '未分类').trim();
  const sourceSha256 = await fileSha256(absolutePath);
  const id = String(metadata.id || existingIdsByPath.get(relativePath) || sourceSha256.slice(0, 12));
  const createdAt = metadata.createdAt || metadata.generatedAt || metadata.date || getGitCreatedAt(relativePath) || fileStats.mtime.toISOString();
  let sourceDimensions = { width: Number(metadata.width) || 0, height: Number(metadata.height) || 0 };
  let thumbnail = relativePath;

  try {
    sourceDimensions = orientedDimensions(await sharp(absolutePath, { animated: false, failOn: 'none' }).metadata());
    const thumbnailName = thumbnailNameFor(sourceSha256);
    usedThumbnailNames.add(thumbnailName);
    await ensureThumbnail(absolutePath, thumbnailName);
    thumbnail = `${thumbnailPublicDirectory}/${thumbnailName}`;
  } catch (error) {
    thumbnailStats.failed += 1;
    issues.push({ severity: 'warning', code: 'thumbnail-failed', path: relativePath, message: error.message });
  }

  const dimensionTags = [character, ...dimensions.theme, ...dimensions.scene, ...dimensions.palette, ...dimensions.composition, dimensions.assetType];
  const tags = [...new Set([...automaticTags, ...metadataTags, ...dimensionTags].filter(Boolean))];
  const record = {
    id,
    path: relativePath,
    thumbnail,
    title: metadata.title || titleFromFilename(absolutePath),
    category: character,
    character,
    theme: dimensions.theme,
    scene: dimensions.scene,
    palette: dimensions.palette,
    composition: dimensions.composition,
    assetType: dimensions.assetType,
    actions: dimensions.actions,
    expressions: dimensions.expressions,
    confirmedTraits: dimensions.confirmedTraits,
    description: metadata.description || '',
    tags,
    createdAt,
    featured: Boolean(metadata.featured),
    width: sourceDimensions.width || Number(metadata.width) || undefined,
    height: sourceDimensions.height || Number(metadata.height) || undefined,
    sourceSha256,
    sourceFileId: metadata.sourceFileId || undefined,
    generationSequence: Number(metadata.generationSequence) || undefined,
    generatedAt: metadata.generatedAt || metadata.createdAt || undefined,
    sourceChat: metadata.sourceChat || undefined,
  };
  validateRecord(record, taxonomy, metadata, issues);
  return record;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, () => worker()));
  return results;
}

async function removeUnusedThumbnails() {
  let entries = [];
  try { entries = await readdir(thumbnailCacheDirectory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  await Promise.all(entries.map(async (entry) => {
    if (!entry.isFile() || usedThumbnailNames.has(entry.name)) return;
    await rm(path.join(thumbnailCacheDirectory, entry.name), { force: true });
    thumbnailStats.removed += 1;
  }));
}

function taxonomyForFrontend(taxonomy) {
  return Object.fromEntries(Object.entries(taxonomy.dimensions || {}).map(([key, values]) => [key, values.map(({ value, label }) => ({ value, label }))]));
}

async function main() {
  await mkdir(outputDirectory, { recursive: true });
  await mkdir(thumbnailCacheDirectory, { recursive: true });
  const taxonomy = await readJsonOptional(taxonomyFile, { schemaVersion: 2, dimensions: {}, rules: {} });
  const existingGallery = await readJsonOptional(outputFile, { images: [] });
  const existingIdsByPath = new Map((existingGallery.images || []).map((item) => [String(item.path || ''), String(item.id || '')]).filter(([, id]) => id));
  const issues = [];
  const allFiles = await walk(imagesDirectory);
  const imageFiles = allFiles.filter((file) => imageExtensions.has(path.extname(file).toLowerCase()));
  const images = await mapWithConcurrency(imageFiles, 4, (file) => createRecord(file, { taxonomy, existingIdsByPath, issues }));

  images.sort((a, b) => Number(b.featured) - Number(a.featured) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const idMap = new Map();
  const hashMap = new Map();
  for (const image of images) {
    if (idMap.has(image.id)) issues.push({ severity: 'error', code: 'duplicate-id', path: image.path, otherPath: idMap.get(image.id), message: `图片 ID 重复：${image.id}` });
    else idMap.set(image.id, image.path);
    if (hashMap.has(image.sourceSha256)) issues.push({ severity: 'warning', code: 'duplicate-content', path: image.path, otherPath: hashMap.get(image.sourceSha256), message: '检测到内容完全相同的图片。' });
    else hashMap.set(image.sourceSha256, image.path);
  }

  await removeUnusedThumbnails();
  const summary = {
    images: images.length,
    errors: issues.filter((item) => item.severity === 'error').length,
    warnings: issues.filter((item) => item.severity === 'warning').length,
    info: issues.filter((item) => item.severity === 'info').length,
  };
  const payload = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    count: images.length,
    thumbnail: { width: thumbnailWidth, format: 'webp', quality: thumbnailQuality },
    taxonomy: taxonomyForFrontend(taxonomy),
    validation: summary,
    images,
  };
  const report = { schemaVersion: 2, generatedAt: payload.generatedAt, summary, issues };
  await writeFile(outputFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await writeFile(validationFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`已生成 ${images.length} 张图片的 V2 索引：${toPosix(path.relative(root, outputFile))}`);
  console.log(`元数据校验：错误 ${summary.errors}，警告 ${summary.warnings}，待固化 ID ${summary.info}`);
  console.log(`缩略图：新生成 ${thumbnailStats.generated}，复用 ${thumbnailStats.reused}，失败 ${thumbnailStats.failed}，清理 ${thumbnailStats.removed}`);
  if (summary.errors) throw new Error(`元数据存在 ${summary.errors} 个阻断错误，详见 data/validation-report.json`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
