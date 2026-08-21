import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const galleryPath=path.join(root,'data','gallery.json');

function parseArgs(argv){
  const options={nearThreshold:6,report:null,failExact:true,crossDomain:false};
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(arg==='--near-threshold')options.nearThreshold=Number(argv[++i]);
    else if(arg==='--report')options.report=argv[++i];
    else if(arg==='--no-fail-exact')options.failExact=false;
    else if(arg==='--cross-domain')options.crossDomain=true;
    else throw new Error(`未知参数：${arg}`);
  }
  if(!Number.isInteger(options.nearThreshold)||options.nearThreshold<0||options.nearThreshold>24)throw new Error('--near-threshold 必须是 0-24 的整数。');
  return options;
}

const cosine=Array.from({length:8},(_,u)=>Array.from({length:32},(_,x)=>Math.cos(((2*x+1)*u*Math.PI)/64)));

async function perceptualHash(buffer){
  const pixels=await sharp(buffer,{failOn:'none'}).rotate().grayscale().resize(32,32,{fit:'fill'}).raw().toBuffer();
  const coeff=[];
  for(let v=0;v<8;v++){
    for(let u=0;u<8;u++){
      let sum=0;
      for(let y=0;y<32;y++){
        const cy=cosine[v][y];
        for(let x=0;x<32;x++)sum+=pixels[y*32+x]*cosine[u][x]*cy;
      }
      coeff.push(sum);
    }
  }
  const values=coeff.slice(1).sort((a,b)=>a-b);
  const median=values[Math.floor(values.length/2)];
  let hash=0n;
  for(const value of coeff)hash=(hash<<1n)|(value>median?1n:0n);
  return hash;
}

function hamming(a,b){
  let value=a^b,count=0;
  while(value){count+=Number(value&1n);value>>=1n;}
  return count;
}

function ratioClose(a,b){
  if(!(a>0&&b>0))return true;
  return Math.abs(Math.log(a/b))<=0.06;
}

function publicAsset(item){return {id:item.asset.id,title:item.asset.title,path:item.asset.path,domain:item.asset.domain};}

async function main(){
  const options=parseArgs(process.argv.slice(2));
  const gallery=JSON.parse(await readFile(galleryPath,'utf8'));
  if(gallery.schemaVersion!==3||!Array.isArray(gallery.assets))throw new Error('data/gallery.json 必须是 schemaVersion 3。');

  const analyzed=[];
  for(let i=0;i<gallery.assets.length;i++){
    const asset=gallery.assets[i];
    const source=path.join(root,asset.path);
    const buffer=await readFile(source);
    const metadata=await sharp(buffer,{failOn:'none'}).rotate().metadata();
    const width=Number(metadata.width)||0,height=Number(metadata.height)||0;
    if(!(width>0&&height>0))throw new Error(`无法读取尺寸：${asset.path}`);
    analyzed.push({
      asset,
      sha256:createHash('sha256').update(buffer).digest('hex'),
      phash:await perceptualHash(buffer),
      width,
      height,
      ratio:width/height
    });
    if((i+1)%25===0||i+1===gallery.assets.length)console.log(`已分析 ${i+1}/${gallery.assets.length}`);
  }

  const bySha=new Map();
  for(const item of analyzed){
    const group=bySha.get(item.sha256)||[];
    group.push(item);bySha.set(item.sha256,group);
  }
  const exactDuplicates=[...bySha.entries()].filter(([,items])=>items.length>1).map(([sha256,items])=>({sha256,assets:items.map(publicAsset)}));

  const nearDuplicates=[];
  for(let i=0;i<analyzed.length;i++){
    for(let j=i+1;j<analyzed.length;j++){
      const a=analyzed[i],b=analyzed[j];
      if(a.sha256===b.sha256)continue;
      if(!options.crossDomain&&a.asset.domain!==b.asset.domain)continue;
      if(!ratioClose(a.ratio,b.ratio))continue;
      const distance=hamming(a.phash,b.phash);
      if(distance>options.nearThreshold)continue;
      nearDuplicates.push({
        distance,
        similarity:Number(((64-distance)/64).toFixed(4)),
        a:publicAsset(a),
        b:publicAsset(b)
      });
    }
  }
  nearDuplicates.sort((a,b)=>a.distance-b.distance||a.a.path.localeCompare(b.a.path));

  const report={
    schemaVersion:1,
    algorithm:{exact:'sha256',near:'phash-32x32-dct-8x8',nearThreshold:options.nearThreshold,aspectRatioTolerance:'log-ratio <= 0.06',crossDomain:options.crossDomain},
    assetCount:analyzed.length,
    exactDuplicateGroups:exactDuplicates,
    nearDuplicatePairs:nearDuplicates
  };

  if(options.report){
    const output=path.resolve(root,options.report);
    await writeFile(output,`${JSON.stringify(report,null,2)}\n`,'utf8');
    console.log(`报告已写入：${path.relative(root,output)}`);
  }

  console.log(`重复检查完成：${analyzed.length} 张；完全重复 ${exactDuplicates.length} 组；视觉近似 ${nearDuplicates.length} 对（pHash 距离 <= ${options.nearThreshold}）。`);
  for(const group of exactDuplicates.slice(0,10))console.log(`完全重复：${group.assets.map(item=>`${item.id} ${item.path}`).join(' | ')}`);
  for(const pair of nearDuplicates.slice(0,20))console.log(`近似 d=${pair.distance}：${pair.a.id} ${pair.a.path} | ${pair.b.id} ${pair.b.path}`);

  if(exactDuplicates.length&&options.failExact)process.exitCode=2;
}

main().catch(error=>{console.error(error);process.exitCode=1;});
