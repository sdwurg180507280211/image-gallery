import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {readFile,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const galleryPath=path.join(root,'data','gallery.json');
const outputPath=path.join(root,'data','r2-shadow-manifest.json');

function parseArgs(argv){
  const options={write:false,hash:false,domain:'character'};
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(arg==='--write')options.write=true;
    else if(arg==='--hash')options.hash=true;
    else if(arg==='--all-domains')options.domain='all';
    else if(arg==='--domain')options.domain=argv[++i];
    else throw new Error(`未知参数：${arg}`);
  }
  if(!['character','medical-kv','all'].includes(options.domain))throw new Error('--domain 仅支持 character / medical-kv。');
  return options;
}

function contentTypeFor(filePath){
  switch(path.extname(filePath).toLowerCase()){
    case '.png':return 'image/png';
    case '.jpg':case '.jpeg':return 'image/jpeg';
    case '.webp':return 'image/webp';
    default:return 'application/octet-stream';
  }
}

function r2KeyFor(asset){
  const ext=path.extname(asset.path).toLowerCase()||'.bin';
  return `originals/${asset.domain}/${asset.id}${ext}`;
}

async function sha256(filePath){
  return new Promise((resolve,reject)=>{
    const hash=createHash('sha256');
    const stream=createReadStream(filePath);
    stream.on('data',chunk=>hash.update(chunk));
    stream.on('error',reject);
    stream.on('end',()=>resolve(hash.digest('hex')));
  });
}

async function main(){
  const options=parseArgs(process.argv.slice(2));
  const gallery=JSON.parse(await readFile(galleryPath,'utf8'));
  if(gallery.schemaVersion!==3||!Array.isArray(gallery.assets))throw new Error('data/gallery.json 必须是 schemaVersion 3。');

  const selected=gallery.assets.filter(asset=>options.domain==='all'||asset.domain===options.domain);
  const objects=[];
  let totalBytes=0;

  for(let i=0;i<selected.length;i++){
    const asset=selected[i];
    const source=path.join(root,asset.path);
    const info=await stat(source);
    if(!info.isFile())throw new Error(`原图不是文件：${asset.path}`);
    const record={
      assetId:asset.id,
      domain:asset.domain,
      sourcePath:asset.path,
      r2Key:r2KeyFor(asset),
      bytes:info.size,
      contentType:contentTypeFor(asset.path)
    };
    if(options.hash)record.sha256=await sha256(source);
    objects.push(record);
    totalBytes+=info.size;
    if((i+1)%50===0||i+1===selected.length)console.log(`已检查 ${i+1}/${selected.length}`);
  }

  const manifest={
    schemaVersion:1,
    mode:'shadow-copy',
    domain:options.domain,
    generatedAt:new Date().toISOString(),
    objectCount:objects.length,
    totalBytes,
    includesSha256:options.hash,
    deleteSourceAfterCopy:false,
    objects
  };

  console.log(`R2 shadow-copy 清单：${objects.length} 个对象，${(totalBytes/1024/1024/1024).toFixed(2)} GiB。`);
  console.log('源文件删除：禁止。该阶段只允许复制。');
  if(!options.hash)console.log('当前未计算 SHA-256；正式迁移前建议使用 --hash 生成可校验清单。');

  if(options.write){
    await writeFile(outputPath,`${JSON.stringify(manifest,null,2)}\n`,'utf8');
    console.log(`已写入：${path.relative(root,outputPath)}`);
  }else{
    console.log('当前为 dry-run；加 --write 才会写入清单文件。');
  }
}

main().catch(error=>{console.error(error);process.exitCode=1;});
