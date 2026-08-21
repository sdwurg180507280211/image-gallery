import {execFileSync} from 'node:child_process';
import {access,mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=Object.fromEntries(process.argv.slice(2).map(value=>{const [key,...rest]=value.replace(/^--/,'').split('=');return [key,rest.join('=')||true];}));
const category=String(args.category||'').trim();
const family=String(args.family||'').trim();
if(!category)throw new Error('缺少 --category=<人物颜色分类>');

const galleryPath=path.join(root,'data','gallery.json');
const indexPath=path.join(root,'data','prompt-index.json');
const readmePath=path.join(root,'prompts','README.md');
const assetPromptDir=path.join(root,'prompts','assets');

async function exists(file){try{await access(file);return true}catch{return false}}
function runGit(args){return execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']});}
function historicalSidecar(asset){
  const sidecar=asset.path.replace(/\.[^.]+$/,'.json');
  const revisions=runGit(['rev-list','--all','--',sidecar]).trim().split(/\s+/).filter(Boolean);
  for(const sha of revisions){
    try{return JSON.parse(runGit(['show',`${sha}:${sidecar}`]));}catch{}
  }
  throw new Error(`Git 历史中找不到 sidecar：${sidecar}`);
}

const themeLabels={
  battle:'黑暗东方幻想战斗场景，突出武器、力量和动态能量轨迹',
  magic:'暗色东方魔法空间，以法术光、能量粒子和神秘氛围为主',
  'fire-magic':'红黑火焰魔法场景，以红色能量、火光和金色高光形成强对比',
  celestial:'暗色神性 / 天空幻想场景，以羽翼、光辉和星尘强化神秘感',
  'fantasy-portrait':'暗色轻奢东方幻想肖像场景，强调人物、珠宝、服装和眼神',
  'multi-panel':'黑金人物力量展示场景，保持统一身份与强烈视觉中心'
};
function inferTheme(asset,meta){
  const parts=asset.path.split('/');
  const pathTheme=parts[2]||'';
  const tagTheme=(meta.tags||[]).find(tag=>themeLabels[tag]);
  return tagTheme||pathTheme||'fantasy-portrait';
}
function inferAction(asset,meta){
  const source=`${asset.path} ${asset.title} ${(meta.tags||[]).join(' ')}`;
  if(/closed-eyes|闭眼/i.test(source))return '闭眼静默，保持克制而神性的姿态';
  if(/levitation|浮空|飞行/i.test(source))return '身体浮空并施展魔法，衣摆和发丝形成轻盈动势';
  if(/summoning|召唤/i.test(source))return '抬手进行召唤法术，能量在手部或身体周围聚集';
  if(/crimson-orb|红球|红珠|能量球|魔珠/i.test(source))return '操控红色发光能量球，让法球成为人物之外的第二视觉焦点';
  if(/sword|剑|剑士|战士/i.test(source)&&/dance|舞/i.test(source))return '持剑完成有力量感的剑舞动作，保持身体线条清晰';
  if(/sword|剑|剑士/i.test(source))return '持剑形成明确战斗姿态，武器方向服务人物动势';
  if(/dance|舞动|舞者|之舞/i.test(source))return '以舞动或旋转动作表现力量与优雅，服装和能量轨迹随动作展开';
  if(/power-pose|强势|力量|决绝|威严/i.test(source))return '采用强势、稳定的施法或力量展示姿态';
  if(/battle|战斗|冲锋|攻击/i.test(source))return '采用富有张力的战斗姿态，身体重心和能量方向明确';
  if(/magic|魔法|女巫|法师|术士/i.test(source))return '采用自然的施法姿态，手势与魔法光效形成互动';
  return '采用独立人物肖像姿态，眼神直接与镜头互动';
}
function inferFraming(meta){
  const tags=meta.tags||[];
  const values=['人物特写','胸像','半身','全身构图','独立大图'].filter(value=>tags.includes(value));
  return values.length?values.join('、'):(meta.composition||'独立大图');
}
function inferMoods(meta){
  const moodSet=new Set(['神秘','清冷','凌厉','温柔','妩媚','优雅','自信','决绝','冷静','魅惑','庄严','威严','亲近']);
  const moods=(meta.tags||[]).filter(tag=>moodSet.has(tag));
  return [...new Set(moods)].slice(0,4).join('、')||'神秘、清冷、优雅';
}
function renderPrompt(asset,meta){
  const theme=inferTheme(asset,meta);
  const action=inferAction(asset,meta);
  const framing=inferFraming(meta);
  const moods=inferMoods(meta);
  const description=String(meta.description||`${asset.title}历史生成作品。`).trim();
  const sequence=meta.generationSequence??'未知';
  return `# ${asset.title}\n\n> 提示词类型：reconstructed  \n> 关联人物：${family||'红裳仙姬'}  \n> 历史依据：原图 + Git 历史 sidecar Metadata（generationSequence: ${sequence}）\n\n## 生成提示词\n\n保持同一位成年东方女性“${family||'红裳仙姬'}”的人物身份与面部辨识度。人物以黑色高盘发、琥珀金色眼眸、精致金色发饰与红宝石耳坠为稳定身份特征，五官精致，眼神具有明确互动感。不要因为本张服装、武器或魔法效果改变人物身份。\n\n本张作品目标为“${asset.title}”。历史描述：${description}\n\n场景与主题：${themeLabels[theme]||themeLabels['fantasy-portrait']}。整体以黑色、深红与金色为主，服装保持黑金东方幻想礼服 / 战斗服的精致层次，以暗红布料、红宝石和金属饰件作为点缀。材质强调丝绸、金属、宝石与细腻刺绣，不做廉价 cosplay 质感。\n\n构图采用${framing}。${action}。人物始终是第一视觉中心，眼睛直接或强烈地与镜头产生互动；武器、法球、火焰、羽翼和能量轨迹只作为动作与空间层次的辅助，不遮挡脸部。\n\n人物神态以${moods}为主，根据动作保持克制而有力量的表情。灯光采用暗背景中的金色轮廓光、红色能量光与柔和面部主光，保证面部皮肤细节自然清晰，珠宝和金属边缘有精致高光。电影级东方幻想人像质感，高细节，高分辨率，浅景深或具有明确空间层次。\n\n不要文字，不要水印，不要低清晰度，不要脸部变形，不要多余手指，不要让魔法效果覆盖五官，不要改变人物身份。\n`;
}

async function updateReadme(done,total){
  let text=await readFile(readmePath,'utf8');
  const line=`- 黑色系「${family||'红裳仙姬'}」：${done} / ${total} 已完成，均为 \`reconstructed\`。`;
  if(text.includes('黑色系「'))text=text.replace(/- 黑色系「[^\n]+/u,line);
  else if(text.includes('## 当前进度'))text=`${text.trimEnd()}\n${line}\n`;
  else text=`${text.trimEnd()}\n\n## 当前进度\n\n${line}\n`;
  await writeFile(readmePath,text,'utf8');
}

async function main(){
  const gallery=JSON.parse(await readFile(galleryPath,'utf8'));
  if(gallery.schemaVersion!==3||!Array.isArray(gallery.assets))throw new Error('data/gallery.json 必须是 schemaVersion 3。');
  const index=JSON.parse(await readFile(indexPath,'utf8'));
  if(index.schemaVersion!==1||!index.assets)throw new Error('data/prompt-index.json 必须是 schemaVersion 1。');
  const targets=gallery.assets.filter(asset=>asset.domain==='character'&&asset.category===category&&(!family||(asset.tags||[]).includes(family)));
  if(!targets.length)throw new Error(`没有找到 category=${category}${family?` / family=${family}`:''} 的人物素材。`);
  await mkdir(assetPromptDir,{recursive:true});
  let created=0;
  for(const asset of targets){
    const targetPath=path.join(assetPromptDir,`${asset.id}.md`);
    if(await exists(targetPath)&&index.assets[asset.id])continue;
    const meta=historicalSidecar(asset);
    await writeFile(targetPath,renderPrompt(asset,meta),'utf8');
    index.assets[asset.id]={path:`prompts/assets/${asset.id}.md`,kind:'reconstructed'};
    created++;
  }
  await writeFile(indexPath,`${JSON.stringify(index,null,2)}\n`,'utf8');
  const done=targets.filter(asset=>index.assets[asset.id]).length;
  await updateReadme(done,targets.length);
  console.log(`历史提示词回填完成：category=${category} family=${family||'-'} total=${targets.length} created=${created} indexed=${done}`);
}

main().catch(error=>{console.error(error);process.exitCode=1;});
