import { gunzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultManifest = path.join(root, 'data', 'imports', 'v2-audit-merged-178.json.gz.b64');
const summaryPath = path.join(root, 'data', 'imports', 'v2-audit-apply-summary.json');
const manifestPath = path.resolve(root, process.argv[2] || defaultManifest);
const taxonomyPath = path.join(root, 'data', 'taxonomy-v2.json');

function uniq(values) {
  return [...new Set((Array.isArray(values) ? values : values == null ? [] : [values]).map(String).map((value) => value.trim()).filter(Boolean))];
}

function sidecarPath(imagePath) {
  return path.join(root, imagePath.replace(/\.[^.]+$/, '.json'));
}

async function readManifest() {
  const encoded = (await readFile(manifestPath, 'utf8')).trim();
  const payload = gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8');
  return JSON.parse(payload);
}

function allowedValues(taxonomy, dimension) {
  return new Set((taxonomy.dimensions?.[dimension] || []).map((item) => item.value));
}

function labelMap(taxonomy, dimension) {
  return new Map((taxonomy.dimensions?.[dimension] || []).map((item) => [item.value, item.label]));
}

function labels(values, map) {
  return uniq(values).map((value) => map.get(value) || value);
}

function buildDescription(entry, labelsByDimension) {
  const theme = labels(entry.theme, labelsByDimension.theme).join('、');
  const scene = labels(entry.scene, labelsByDimension.scene).join('、');
  const palette = labels(entry.palette, labelsByDimension.palette).join('、');
  const composition = labels(entry.composition, labelsByDimension.composition).join('、');
  const parts = [];
  if (theme) parts.push(`主题为${theme}`);
  if (scene) parts.push(`场景包含${scene}`);
  if (palette) parts.push(`配色为${palette}`);
  if (composition) parts.push(`构图为${composition}`);
  return `${entry.character}「${entry.title}」作品，${parts.join('；')}。`;
}

function validateEntry(entry, taxonomy) {
  const problems = [];
  for (const dimension of ['theme', 'scene', 'palette', 'composition']) {
    const allowed = allowedValues(taxonomy, dimension);
    const invalid = uniq(entry[dimension]).filter((value) => !allowed.has(value));
    if (invalid.length) problems.push(`${dimension}: ${invalid.join(', ')}`);
  }
  if (!allowedValues(taxonomy, 'assetType').has(entry.assetType)) problems.push(`assetType: ${entry.assetType}`);
  if (!entry.repositoryPath?.startsWith('images/')) problems.push('repositoryPath 必须位于 images/');
  if (!entry.id) problems.push('缺少固定 id');
  return problems;
}

async function main() {
  const [manifest, taxonomy] = await Promise.all([
    readManifest(),
    readFile(taxonomyPath, 'utf8').then(JSON.parse),
  ]);
  const labelsByDimension = Object.fromEntries(
    ['theme', 'scene', 'palette', 'composition', 'assetType'].map((dimension) => [dimension, labelMap(taxonomy, dimension)]),
  );

  const seenPaths = new Set();
  const seenIds = new Set();
  const results = [];
  let changed = 0;

  for (const entry of manifest.entries || []) {
    if (seenPaths.has(entry.repositoryPath)) throw new Error(`迁移清单路径重复：${entry.repositoryPath}`);
    if (seenIds.has(entry.id)) throw new Error(`迁移清单 ID 重复：${entry.id}`);
    seenPaths.add(entry.repositoryPath);
    seenIds.add(entry.id);

    const problems = validateEntry(entry, taxonomy);
    if (problems.length) throw new Error(`${entry.repositoryPath} 分类值无效：${problems.join('；')}`);

    const metadataPath = sidecarPath(entry.repositoryPath);
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
    if (String(metadata.id || '') !== String(entry.id)) {
      throw new Error(`${entry.repositoryPath} 固定 ID 不匹配：仓库=${metadata.id || '空'}，清单=${entry.id}`);
    }

    const updated = {
      ...metadata,
      schemaVersion: 2,
      id: entry.id,
      title: metadata.title || entry.title,
      category: entry.character,
      character: entry.character,
      theme: uniq(entry.theme),
      scene: uniq(entry.scene),
      palette: uniq(entry.palette),
      composition: uniq(entry.composition),
      assetType: entry.assetType,
      actions: uniq(entry.actions),
      expressions: uniq(entry.expressions),
      confirmedTraits: uniq(entry.confirmedTraits),
      sourceChat: entry.sourceBatch,
      sourceBatch: entry.sourceBatch,
      generationSequence: Number(entry.generationSequence) || undefined,
      needsManualReview: Boolean(entry.needsManualReview),
      manualReviewReason: entry.needsManualReview ? String(entry.manualReviewReason || '') : '',
      auditBasis: entry.needsManualReview ? String(entry.auditBasis || '') : undefined,
      auditReviewedAt: manifest.generatedAt,
      description: buildDescription(entry, labelsByDimension),
      tags: uniq([
        entry.character,
        ...entry.actions,
        ...entry.expressions,
        ...entry.confirmedTraits,
      ]),
    };

    if (entry.sourceFileId) updated.sourceFileId = entry.sourceFileId;
    else delete updated.sourceFileId;
    if (entry.generatedAt) updated.generatedAt = entry.generatedAt;
    else delete updated.generatedAt;
    if (!updated.auditBasis) delete updated.auditBasis;
    if (!updated.generationSequence) delete updated.generationSequence;

    const before = `${JSON.stringify(metadata, null, 2)}\n`;
    const after = `${JSON.stringify(updated, null, 2)}\n`;
    if (before !== after) {
      await writeFile(metadataPath, after, 'utf8');
      changed += 1;
    }
    results.push({
      repositoryPath: entry.repositoryPath,
      metadataPath: path.relative(root, metadataPath).split(path.sep).join('/'),
      id: entry.id,
      changed: before !== after,
      needsManualReview: Boolean(entry.needsManualReview),
    });
  }

  if (results.length !== 178) throw new Error(`迁移清单数量异常：${results.length}，预期 178`);

  const summary = {
    schemaVersion: 2,
    appliedAt: new Date().toISOString(),
    manifestGeneratedAt: manifest.generatedAt,
    total: results.length,
    changed,
    unchanged: results.length - changed,
    needsManualReview: results.filter((item) => item.needsManualReview).length,
    results,
  };
  await mkdir(path.dirname(summaryPath), { recursive: true });
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ total: summary.total, changed: summary.changed, needsManualReview: summary.needsManualReview }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
