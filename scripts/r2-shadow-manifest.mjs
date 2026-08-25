import {createHash} from 'node:crypto';
import {readFile,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const galleryPath=path.join(root,'data','gallery.json');
const outputPath=path.join(root,'data','r2-shadow-manifest.json');

function r2KeyFor(asset){
  return `originals/${String(asset.path).replace(/^images\//,'')}`;
}

async function main(){
  const gallery=JSON.parse(await readFile(galleryPath,'utf8'));
  if(gallery.schemaVersion!==3||!Array.isArray(gallery.assets))throw new Error('data/gallery.json 必须是 schemaVersion 3。');

  const objects=[];
  for(let i=0;i<gallery.assets.length;i++){
    const asset=gallery.assets[i];
    const sourcePath=path.join(root,asset.path);
    const [buffer,info]=await Promise.all([readFile(sourcePath),stat(sourcePath)]);
    objects.push({
      assetId:asset.id,
      domain:asset.domain,
      sourcePath:asset.path,
      r2Key:r2KeyFor(asset),
      size:info.size,
      sha256:createHash('sha256').update(buffer).digest('hex')
    });
    if((i+1)%25===0||i+1===gallery.assets.length)console.log(`已生成 ${i+1}/${gallery.assets.length}`);
  }

  const totalBytes=objects.reduce((sum,item)=>sum+item.size,0);
  const manifest={
    schemaVersion:1,
    generatedAt:new Date().toISOString(),
    source:'data/gallery.json',
    destination:{provider:'cloudflare-r2',prefix:'originals/'},
    count:objects.length,
    totalBytes,
    objects
  };
  await writeFile(outputPath,`${JSON.stringify(manifest,null,2)}\n`,'utf8');
  console.log(`R2 shadow manifest 已生成：${objects.length} 个对象，${totalBytes} bytes。`);
  console.log('注意：此脚本只生成校验清单，不上传、不删除任何文件。');
}

main().catch(error=>{console.error(error);process.exitCode=1;});
