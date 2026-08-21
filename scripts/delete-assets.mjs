import {createHash} from 'node:crypto';
import {access,readFile,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const galleryFile=path.join(root,'data','gallery.json');
const promptIndexFile=path.join(root,'data','prompt-index.json');
const dislikesFile=path.join(root,'data','dislikes.json');
const cacheDir=path.join(root,'.cache','thumbnails-v3');
const dislikeApi='https://xkuzzmqtboclgvkvdlwd.supabase.co/functions/v1/image-dislikes';
const allowedOrigin='https://sdwurg180507280211.github.io';

const args=process.argv.slice(2);
const write=args.includes('--write');
const fromDislikes=args.includes('--from-dislikes');
const skipCloud=args.includes('--skip-cloud');
const requested=args.filter(arg=>!arg.startsWith('--'));

function usage(){
  console.log(`用法:\n  npm run delete-assets -- <asset-id> [asset-id...]\n  npm run delete-assets -- --from-dislikes\n  npm run delete-assets -- --from-dislikes --write\n\n默认只预演。只有传入 --write 才会真正删除。\n--skip-cloud 仅用于云端不可用时的维护操作；正常删除不要使用。`);
}

async function exists(target){try{await access(target);return true;}catch{return false;}}
function insideRoot(target){const relative=path.relative(root,target);return relative&&!relative.startsWith('..')&&!path.isAbsolute(relative);}
function safePath(relative){
  const target=path.resolve(root,relative);
  if(!insideRoot(target))throw new Error(`拒绝访问仓库外路径：${relative}`);
  return target;
}
function metadataCandidate(imagePath){
  const ext=path.extname(imagePath);
  return ext?`${imagePath.slice(0,-ext.length)}.json`:`${imagePath}.json`;
}
async function readJson(file){return JSON.parse(await readFile(file,'utf8'));}
async function writeJson(file,value){await writeFile(file,`${JSON.stringify(value,null,2)}\n`,'utf8');}

async function cloudClear(assetId){
  const response=await fetch(dislikeApi,{
    method:'POST',
    headers:{'Content-Type':'application/json','Origin':allowedOrigin},
    body:JSON.stringify({assetId,disliked:false})
  });
  if(!response.ok)throw new Error(`云端取消“不喜欢”失败 ${assetId}: HTTP ${response.status} ${await response.text()}`);
}

async function main(){
  const gallery=await readJson(galleryFile);
  const promptIndex=await readJson(promptIndexFile);
  const dislikes=await readJson(dislikesFile);
  if(gallery.schemaVersion!==3||!Array.isArray(gallery.assets))throw new Error('data/gallery.json 格式非法。');
  if(promptIndex.schemaVersion!==1||!promptIndex.assets||typeof promptIndex.assets!=='object')throw new Error('data/prompt-index.json 格式非法。');
  if(dislikes.schemaVersion!==1||!Array.isArray(dislikes.assetIds))throw new Error('data/dislikes.json 格式非法。');

  const ids=new Set(requested);
  if(fromDislikes)for(const id of dislikes.assetIds)ids.add(id);
  if(!ids.size){usage();process.exitCode=2;return;}

  const byId=new Map(gallery.assets.map(asset=>[asset.id,asset]));
  const missing=[...ids].filter(id=>!byId.has(id));
  if(missing.length)throw new Error(`找不到素材 ID：${missing.join(', ')}`);

  const plans=[];
  for(const id of ids){
    const asset=byId.get(id);
    const paths=new Set([asset.path]);
    const meta=metadataCandidate(asset.path);
    if(await exists(safePath(meta)))paths.add(meta);
    const prompt=promptIndex.assets[id];
    if(prompt?.path&&await exists(safePath(prompt.path)))paths.add(prompt.path);

    const imageFile=safePath(asset.path);
    if(await exists(imageFile)){
      const buffer=await readFile(imageFile);
      const hash=createHash('sha256').update(buffer).digest('hex').slice(0,24);
      for(const width of [640,1280]){
        const cacheRelative=path.join('.cache','thumbnails-v3',`${hash}-${width}.webp`);
        if(await exists(safePath(cacheRelative)))paths.add(cacheRelative);
      }
    }
    plans.push({id,title:asset.title,paths:[...paths]});
  }

  console.log(`${write?'将执行删除':'删除预演'}：${plans.length} 张素材`);
  for(const plan of plans){
    console.log(`\n- ${plan.id}  ${plan.title}`);
    for(const file of plan.paths)console.log(`  ${file}`);
  }

  if(!write){
    console.log('\n未修改任何文件。确认无误后追加 --write。');
    return;
  }

  if(!skipCloud){
    console.log('\n先清理云端“不喜欢”状态…');
    for(const id of ids)await cloudClear(id);
  }else{
    console.warn('\n警告：已跳过云端状态清理。后续必须人工同步 Supabase，否则镜像任务可能重新写回旧 ID。');
  }

  gallery.assets=gallery.assets.filter(asset=>!ids.has(asset.id));
  for(const id of ids)delete promptIndex.assets[id];
  dislikes.assetIds=dislikes.assetIds.filter(id=>!ids.has(id));

  await writeJson(galleryFile,gallery);
  await writeJson(promptIndexFile,promptIndex);
  await writeJson(dislikesFile,dislikes);

  for(const plan of plans){
    for(const relative of plan.paths){
      await rm(safePath(relative),{force:true});
    }
  }

  console.log(`\n删除完成：${plans.length} 张。建议随后运行 npm run build 校验索引与文件一致性。`);
}

main().catch(error=>{console.error(error);process.exitCode=1;});
