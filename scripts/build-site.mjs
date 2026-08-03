import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

async function copyIfExists(source, target) {
  try {
    await cp(source, target, { recursive: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function main() {
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });

  await copyIfExists(path.join(root, 'index.html'), path.join(dist, 'index.html'));
  await copyIfExists(path.join(root, 'review.html'), path.join(dist, 'review.html'));
  await copyIfExists(path.join(root, 'assets'), path.join(dist, 'assets'));
  await copyIfExists(path.join(root, 'data'), path.join(dist, 'data'));
  await copyIfExists(path.join(root, 'images'), path.join(dist, 'images'));
  await copyIfExists(
    path.join(root, '.cache', 'thumbnails'),
    path.join(dist, 'generated', 'thumbnails'),
  );

  await writeFile(path.join(dist, '.nojekyll'), '', 'utf8');
  console.log('已生成 GitHub Pages 发布目录：dist/');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
