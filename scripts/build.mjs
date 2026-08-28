import {createHash} from 'node:crypto';
import {access,cp,mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sourceFile=path.join(root,'data','gallery.json');
const promptIndexFile=path.join(root,'data','prompt-index.json');
const dislikesFile=path.join(root,'data','dislikes.json');
const promptsDir=path.join(root,'prompts');
const thumbnailCacheDir=path.join(root,'.cache','thumbnails-v3');
const publishedCacheDir=path.join(root,'.cache','published-images-v1');
const dist=path.join(root,'dist');
const rawBase='https://raw.githubusercontent.com/sdwurg180507280211/image-gallery/main/';

const charCategories=new Set(['multi-panel','black','red','pink','blue','white','purple','green','gold','other']);
const organs=new Set(['heart','brain','kidney','liver','lung','spleen','stomach','pancreas','vascular','genetics','other']);
const promptKinds=new Set(['original','reconstructed']);

async function exists(p){try{await access(p);return true;}catch{return false;}}

function validate(asset){
  if(!asset?.id||!asset?.path||!asset?.title)throw new Error('素材缺少 id/path/title');
  if(asset.domain==='character'){
    if(!charCategories.has(asset.category))throw new Error(`人物分类非法：${asset.id}`);
    for(const field of ['characterId','seriesId','seriesSlug']){
      if(asset[field]!=null&&(typeof asset[field]!=='string'||!asset[field].trim()))throw new Error(`人物分组字段 ${field} 非法：${asset.id}`);
    }
    return;
  }
  if(asset.domain==='medical-kv'){
    if(!organs.has(asset.organ))throw new Error(`医药KV分类非法：${asset.id}`);
    return;
  }
  throw new Error(`素材域非法：${asset.id}`);
}

function deriveCharacterGrouping(asset){
  if(asset.domain!=='character')return {};
  const segments=String(asset.path).split('/').filter(Boolean);
  if(segments[0]!=='images'||segments.length<4)throw new Error(`人物素材路径需符合 images/<character>/<series>/<file>：${asset.id}`);
  const folderCharacter=segments[1];
  const folderSeries=segments[2];
  const characterId=(asset.characterId||folderCharacter).trim();
  const seriesSlug=(asset.seriesSlug||folderSeries).trim();
  const seriesId=(asset.seriesId||`${characterId}--${seriesSlug}`).trim();
  return {characterId,seriesId,seriesSlug};
}

function buildGroupIndex(assets){
  const characters=new Map();
  for(const asset of assets){
    if(asset.domain!=='character')continue;
    let character=characters.get(asset.characterId);
    if(!character){
      character={
        id:asset.characterId,
        label:asset.characterLabel||asset.tags?.[0]||asset.characterId,
        count:0,
        coverAssetId:asset.id,
        series:new Map()
      };
      characters.set(asset.characterId,character);
    }
    character.count+=1;
    let series=character.series.get(asset.seriesId);
    if(!series){
      series={
        id:asset.seriesId,
        slug:asset.seriesSlug,
        label:asset.seriesLabel||asset.seriesSlug,
        count:0,
        coverAssetId:asset.id
      };
      character.series.set(asset.seriesId,series);
    }
    series.count+=1;
  }
  return {
    schemaVersion:1,
    characters:[...characters.values()].map(character=>({
      id:character.id,
      label:character.label,
      count:character.count,
      coverAssetId:character.coverAssetId,
      series:[...character.series.values()]
    }))
  };
}

async function thumb(source,hash,width,quality){
  const name=`${hash}-${width}.webp`;
  const target=path.join(thumbnailCacheDir,name);
  if(!await exists(target)){
    await sharp(source,{failOn:'none'}).rotate().resize({width,withoutEnlargement:true}).webp({quality,effort:4,smartSubsample:true}).toFile(target);
  }
  return {name,target};
}

async function publishedImage(source,hash){
  const name=`${hash}-2560-q85.webp`;
  const target=path.join(publishedCacheDir,name);
  if(!await exists(target)){
    await sharp(source,{failOn:'none'})
      .rotate()
      .resize({width:2560,height:2560,fit:'inside',withoutEnlargement:true})
      .webp({quality:85,effort:4,smartSubsample:true})
      .toFile(target);
  }
  const meta=await sharp(target,{failOn:'none'}).metadata();
  const width=Number(meta.width)||0,height=Number(meta.height)||0;
  if(!(width>0&&height>0))throw new Error(`无法读取发布图尺寸：${source}`);
  return {name,target,width,height};
}

function displayDistPath(assetRel,hash,taken){
  const segments=assetRel.split('/').filter(Boolean);
  const file=segments.pop();
  const base=file.replace(/\.[^.]+$/,'');
  let rel=`${segments.join('/')}/${base}.webp`;
  if(taken.has(rel)&&taken.get(rel)!==assetRel)rel=`${segments.join('/')}/${base}-${hash.slice(0,8)}.webp`;
  return rel;
}

function rawUrl(assetRel){
  return `${rawBase}${assetRel.split('/').map(encodeURIComponent).join('/')}`;
}

async function cleanCache(cacheDir,usedFiles){
  const entries=await readdir(cacheDir,{withFileTypes:true});
  await Promise.all(entries.filter(entry=>entry.isFile()&&!usedFiles.has(entry.name)).map(entry=>rm(path.join(cacheDir,entry.name),{force:true})));
}

async function main(){
  const doc=JSON.parse(await readFile(sourceFile,'utf8'));
  if(doc.schemaVersion!==3||!Array.isArray(doc.assets))throw new Error('data/gallery.json 必须是 schemaVersion 3。');
  doc.assets.forEach(validate);
  if(new Set(doc.assets.map(a=>a.id)).size!==doc.assets.length)throw new Error('素材 ID 重复。');
  if(new Set(doc.assets.map(a=>a.path)).size!==doc.assets.length)throw new Error('素材路径重复。');

  const assetIds=new Set(doc.assets.map(a=>a.id));
  const promptIndex=JSON.parse(await readFile(promptIndexFile,'utf8'));
  if(promptIndex.schemaVersion!==1||!promptIndex.assets||typeof promptIndex.assets!=='object'||Array.isArray(promptIndex.assets))throw new Error('data/prompt-index.json 必须是 schemaVersion 1。');
  for(const [id,prompt] of Object.entries(promptIndex.assets)){
    if(!assetIds.has(id))throw new Error(`提示词关联了不存在的素材：${id}`);
    if(!prompt?.path||!promptKinds.has(prompt.kind))throw new Error(`提示词索引非法：${id}`);
    if(!await exists(path.join(root,prompt.path)))throw new Error(`提示词文件不存在：${prompt.path}`);
  }

  const dislikes=JSON.parse(await readFile(dislikesFile,'utf8'));
  if(dislikes.schemaVersion!==1||!Array.isArray(dislikes.assetIds))throw new Error('data/dislikes.json 必须是 schemaVersion 1。');
  if(new Set(dislikes.assetIds).size!==dislikes.assetIds.length)throw new Error('不喜欢列表存在重复素材 ID。');
  for(const id of dislikes.assetIds)if(!assetIds.has(id))throw new Error(`不喜欢列表关联了不存在的素材：${id}`);

  await rm(dist,{recursive:true,force:true});
  await mkdir(path.join(dist,'data'),{recursive:true});
  await mkdir(path.join(dist,'generated','thumbnails'),{recursive:true});
  await mkdir(thumbnailCacheDir,{recursive:true});
  await mkdir(publishedCacheDir,{recursive:true});
  await cp(path.join(root,'index.html'),path.join(dist,'index.html'));
  await cp(path.join(root,'wechat'),path.join(dist,'wechat'),{recursive:true});
  await cp(path.join(root,'assets'),path.join(dist,'assets'),{recursive:true});
  await mkdir(path.join(dist,'images'),{recursive:true});
  // 公众号页面仍直接引用 images/wechat，因此该目录保持原样发布。
  if(await exists(path.join(root,'images','wechat'))){
    await cp(path.join(root,'images','wechat'),path.join(dist,'images','wechat'),{recursive:true});
  }
  await cp(promptsDir,path.join(dist,'prompts'),{recursive:true});
  await cp(promptIndexFile,path.join(dist,'data','prompt-index.json'));
  await cp(dislikesFile,path.join(dist,'data','dislikes.json'));

  const built=[];
  const usedThumbnailFiles=new Set();
  const usedPublishedFiles=new Set();
  const displayTargets=new Map();
  for(const asset of doc.assets){
    const source=path.join(root,asset.path);
    if(!await exists(source))throw new Error(`原图不存在：${asset.path}`);
    const buffer=await readFile(source);
    const hash=createHash('sha256').update(buffer).digest('hex').slice(0,24);
    const meta=await sharp(buffer,{failOn:'none'}).rotate().metadata();
    const width=Number(meta.width)||0,height=Number(meta.height)||0;
    if(!(width>0&&height>0))throw new Error(`无法读取尺寸：${asset.path}`);

    const displayRel=displayDistPath(asset.path,hash,displayTargets);
    displayTargets.set(displayRel,asset.path);
    const display=await publishedImage(source,hash);
    usedPublishedFiles.add(display.name);
    await mkdir(path.dirname(path.join(dist,displayRel)),{recursive:true});
    await cp(display.target,path.join(dist,displayRel));

    const small=await thumb(source,hash,640,80);
    usedThumbnailFiles.add(small.name);
    await cp(small.target,path.join(dist,'generated','thumbnails',small.name));

    const record={
      ...asset,
      ...deriveCharacterGrouping(asset),
      originalPath:asset.path,
      originalUrl:rawUrl(asset.path),
      displayPath:displayRel,
      width,
      height,
      displayWidth:display.width,
      displayHeight:display.height,
      thumbnail:`generated/thumbnails/${small.name}`
    };

    if(width/height>=1.15&&width>640){
      const large=await thumb(source,hash,1280,84);
      usedThumbnailFiles.add(large.name);
      await cp(large.target,path.join(dist,'generated','thumbnails',large.name));
      record.thumbnailLarge=`generated/thumbnails/${large.name}`;
      record.thumbnailLargeWidth=Math.min(width,1280);
    }
    built.push(record);
  }

  await cleanCache(thumbnailCacheDir,usedThumbnailFiles);
  await cleanCache(publishedCacheDir,usedPublishedFiles);
  const groupIndex=buildGroupIndex(built);
  await writeFile(path.join(dist,'data','gallery.json'),`${JSON.stringify({schemaVersion:3,count:built.length,assets:built},null,2)}\n`,'utf8');
  await writeFile(path.join(dist,'data','character-series.json'),`${JSON.stringify(groupIndex,null,2)}\n`,'utf8');
  await writeFile(path.join(dist,'.nojekyll'),'','utf8');
  console.log(`构建完成：${built.length} 张素材，${groupIndex.characters.length} 个人物，${Object.keys(promptIndex.assets).length} 条提示词，${dislikes.assetIds.length} 张标记不喜欢。Pages 使用压缩展示图，仓库原图保持不变。`);
}

main().catch(error=>{console.error(error);process.exitCode=1;});
