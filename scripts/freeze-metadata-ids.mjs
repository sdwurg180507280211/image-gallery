import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const galleryPath = path.join(root, 'data', 'gallery.json');
const manifestPath = path.join(root, 'data', 'id-freeze-manifest.json');
const shouldWrite = process.argv.includes('--write');

async function readJson(filePath, fallback = {}) {
  try { return JSON.parse(await readFile(filePath, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

async function main() {
  const gallery = await readJson(galleryPath, { images: [] });
  const records = Array.isArray(gallery) ? gallery : gallery.images || [];
  const manifest = [];
  let changed = 0;

  for (const item of records) {
    if (!item.path || !item.id) continue;
    const imagePath = path.join(root, item.path);
    const sidecarPath = imagePath.replace(/\.[^.]+$/, '.json');
    const metadata = await readJson(sidecarPath, {});
    const next = {
      ...metadata,
      schemaVersion: 2,
      id: item.id,
      sourceSha256: metadata.sourceSha256 || item.sourceSha256 || undefined,
    };
    const differs = metadata.id !== next.id || metadata.schemaVersion !== 2 || (next.sourceSha256 && metadata.sourceSha256 !== next.sourceSha256);
    if (differs) changed += 1;
    if (shouldWrite && differs) {
      await mkdir(path.dirname(sidecarPath), { recursive: true });
      await writeFile(sidecarPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    }
    manifest.push({
      path: item.path,
      metadataPath: path.relative(root, sidecarPath).split(path.sep).join('/'),
      id: item.id,
      sourceSha256: next.sourceSha256 || null,
      changed: differs,
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: shouldWrite ? 'write' : 'dry-run',
    total: manifest.length,
    changed,
    unchanged: manifest.length - changed,
    records: manifest,
  };
  await writeFile(manifestPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`${shouldWrite ? '已写入' : '预演'}固定 ID：总计 ${manifest.length}，需更新 ${changed}。`);
  console.log(`清单：${path.relative(root, manifestPath)}`);
  if (!shouldWrite) console.log('确认后运行：npm run freeze-ids -- --write');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
