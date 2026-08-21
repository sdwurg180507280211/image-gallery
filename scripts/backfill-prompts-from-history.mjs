import {execFileSync} from 'node:child_process';
import {access,mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=Object.fromEntries(process.argv.slice(2).map(value=>{const [key,...rest]=value.replace(/^--/,'').split('=');return [key,rest.join('=')||true];}));
const category=String(args.category||'').trim();
const family=String(args.family||'').trim();
if(!category)throw new Error('缺少 --category=<人物颜色分类|all>');

const galleryPath=path.join(root,'data','gallery.json');
const indexPath=path.join(root,'data','prompt-index.json');
const readmePath=path.join(root,'prompts','README.md');
const assetPromptDir=path.join(root,'prompts','assets');

const categoryLabels={
  'multi-panel':'多宫图',black:'黑色系',red:'红色系',pink:'粉色系',blue:'蓝色系',white:'白色系',purple:'紫色系',green:'绿色系',gold:'金色系',other:'其他'
};
const paletteStyles={
  black:'以黑色、深红和金色为主，服装保持黑金东方幻想礼服 / 战斗服的精致层次，以暗红布料、红宝石和金属饰件作为点缀',
  red:'以朱红、深红和金色为主，服装突出红金东方幻想礼服 / 战斗服，利用金属饰件、红宝石和深色阴影形成层次',
  pink:'以浅粉、象牙白和淡金色为主，服装轻盈柔和，保持精致刺绣、金色滚边与浪漫但不甜腻的高级感',
  blue:'以深蓝、宝石蓝与金色为主，服装保持蓝金东方幻想质感，以冷色环境光和暖金高光形成对比',
  white:'以象牙白、银白与淡金色为主，服装轻盈洁净，强调柔和层次、金属边缘和高级神性氛围',
  purple:'以紫色、深紫与金色为主，服装突出紫金东方幻想质感，以宝石光泽和神秘冷暖光增强层次',
  green:'以翡翠绿、墨绿与金色为主，服装突出绿金东方幻想质感，以宝石、金属和深色背景强化高级感',
  gold:'以金色、香槟金和象牙色为主，服装突出华丽金属与织物质感，避免大面积单调纯金',
  other:'根据历史图像与 sidecar 元数据保持原有主色关系，不擅自改变服装和环境的主配色',
  'multi-panel':'保持历史多宫图中各分镜原有的配色关系与主题差异，同时确保同一人物身份、脸部与珠宝语言一致'
};
const themeLabels={
  battle:'黑暗东方幻想战斗场景，突出武器、力量和动态能量轨迹',
  magic:'东方魔法空间，以法术光、能量粒子和神秘氛围为主',
  'fire-magic':'火焰魔法场景，以红色能量、火光和金色高光形成强对比',
  celestial:'神性 / 天空幻想场景，以羽翼、光辉和星尘强化神秘感',
  'fantasy-portrait':'东方幻想肖像场景，强调人物、珠宝、服装、材质和眼神',
  'spring-garden':'春日花园场景，以花枝、柔和自然光和浅景深营造轻盈空气感',
  snow:'雪景幻想场景，以冷色环境、雪粒和人物暖色细节形成对比',
  'moon-night':'月夜幻想场景，以月光、夜色、水面或灯火营造宁静神秘感',
  'lotus-pond':'荷塘幻想场景，以水面、荷花、月色与人物形成东方意境',
  'desert-oasis':'沙漠绿洲幻想场景，以暖色沙丘、绿洲与人物形成戏剧反差',
  desert:'沙漠幻想场景，以沙丘、夕阳或风沙营造辽阔空间感',
  'cloud-palace':'云端宫殿幻想场景，以云海、宫殿与神性光线营造宏大感',
  phoenix:'凤凰与火焰幻想场景，以火羽、能量轨迹和人物动作形成视觉高潮',
  palace:'东方宫廷场景，以烛光、帷幔、金属与织物细节营造华丽氛围',
  'night-city':'夜色城市幻想场景，以城市灯光、夜景和人物形成现代奇幻反差',
  'multi-theme':'多主题分镜作品，每个分镜应有清晰独立场景，同时保持人物身份高度一致',
  'multi-panel':'多宫图 / 多分镜展示，强调同一人物在不同动作或场景中的连续一致性'
};

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
function asArray(value){return Array.isArray(value)?value:(value?[value]:[])}
function unique(values){return [...new Set(values.filter(Boolean))]}
function inferTheme(asset,meta){
  const pathTheme=asset.path.split('/')[2]||'';
  const candidates=[...asArray(meta.scene),...asArray(meta.theme),...(meta.tags||[]),pathTheme];
  return candidates.find(value=>themeLabels[value])||pathTheme||'fantasy-portrait';
}
function themeDescription(theme){return themeLabels[theme]||`以“${theme}”为主要场景 / 主题，保持历史作品原有的空间关系、道具语义和氛围，不擅自换成无关背景`}
function inferAction(asset,meta){
  const source=`${asset.path} ${asset.title} ${(meta.tags||[]).join(' ')} ${asArray(meta.actions).join(' ')}`;
  const explicit=asArray(meta.actions).filter(Boolean);
  if(explicit.length)return `${unique(explicit).join('、')}，动作自然且服务画面主题`;
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
  return '采用自然人物姿态，眼神与镜头保持明确互动';
}
function inferFraming(meta){
  const labelMap={'single-image':'独立大图','close-up':'人物特写',bust:'胸像','half-body':'半身','full-body':'全身','five-panel':'五宫格','ten-panel':'十宫格',collage:'拼图'};
  const fromComposition=asArray(meta.composition).map(value=>labelMap[value]||value);
  const fromTags=['人物特写','胸像','半身','全身构图','独立大图','多宫图','五宫格','十宫格'].filter(value=>(meta.tags||[]).includes(value));
  return unique([...fromComposition,...fromTags]).join('、')||'独立大图';
}
function inferMoods(meta){
  const explicit=asArray(meta.expressions);
  if(explicit.length)return unique(explicit).slice(0,4).join('、');
  const moodSet=new Set(['神秘','清冷','凌厉','温柔','妩媚','优雅','自信','决绝','冷静','魅惑','庄严','威严','亲近','浅笑','凝视']);
  const moods=(meta.tags||[]).filter(tag=>moodSet.has(tag));
  return unique(moods).slice(0,4).join('、')||'神秘、清冷、优雅';
}
function inferIdentity(meta){
  const tags=meta.tags||[];
  const traitPatterns=[/成年|少女|女性|男性/,/黑色.*发|银色.*发|白色.*发|长发|高盘发|高束发/,/眼|眸/,/发饰|耳坠|头饰|珠宝/];
  const traits=[];
  for(const pattern of traitPatterns){const hit=tags.find(tag=>pattern.test(tag));if(hit)traits.push(hit)}
  if(!traits.length&&family==='红裳仙姬')return '成年东方女性，黑色高盘发，琥珀金色眼眸，精致金色发饰与红宝石耳坠';
  if(!traits.length&&family==='金饰花簪东方美人')return '成年东方女性，黑色高盘发，琥珀金色眼眸，精致金属花簪与花卉发饰';
  return unique(traits).join('，');
}
function renderPrompt(asset,meta){
  const theme=inferTheme(asset,meta);
  const action=inferAction(asset,meta);
  const framing=inferFraming(meta);
  const moods=inferMoods(meta);
  const identity=inferIdentity(meta);
  const description=String(meta.description||`${asset.title}历史生成作品。`).trim();
  const sequence=meta.generationSequence??'未知';
  const palette=paletteStyles[asset.category]||paletteStyles.other;
  return `# ${asset.title}\n\n> 提示词类型：reconstructed  \n> 关联人物：${family||((meta.character||meta.category)||'历史人物')}  \n> 历史依据：原图 + Git 历史 sidecar Metadata（generationSequence: ${sequence}）\n\n## 生成提示词\n\n保持同一人物身份与面部辨识度。稳定身份特征：${identity}。五官、脸型与整体人物气质保持一致，不要因为本张服装、武器、场景或魔法效果改变人物身份。\n\n本张作品目标为“${asset.title}”。历史描述：${description}\n\n场景与主题：${themeDescription(theme)}。配色与服装：${palette}。材质强调丝绸、金属、宝石、刺绣与真实光影层次，不做廉价 cosplay 质感。\n\n构图采用${framing}。${action}。人物始终是第一视觉中心，眼睛直接或有明确方向地与镜头产生互动；武器、法球、火焰、羽翼、花枝、粒子和环境元素只作为动作与空间层次辅助，不遮挡五官。\n\n人物神态以${moods}为主，表情克制且符合本张动作。灯光服从历史主题和主色，保证面部皮肤细节自然清晰，珠宝、发饰和服装边缘具有精致高光。电影级东方幻想人像质感，高细节，高分辨率，具有明确空间层次。\n\n不要文字，不要水印，不要低清晰度，不要脸部变形，不要多余手指，不要让特效覆盖五官，不要改变人物身份。\n`;
}

function escapeRegExp(value){return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
async function updateReadme(groups){
  let text=await readFile(readmePath,'utf8');
  if(!text.includes('## 当前进度'))text=`${text.trimEnd()}\n\n## 当前进度\n`;
  for(const [groupCategory,{done,total}] of groups){
    const label=categoryLabels[groupCategory]||groupCategory;
    const familyLabel=family||'历史人物';
    const line=`- ${label}「${familyLabel}」：${done} / ${total} 已完成，均为 \`reconstructed\`。`;
    const pattern=new RegExp(`^- ${escapeRegExp(label)}「${escapeRegExp(familyLabel)}」：[^\\n]+$`,'mu');
    if(pattern.test(text))text=text.replace(pattern,line);else text=`${text.trimEnd()}\n${line}\n`;
  }
  await writeFile(readmePath,text,'utf8');
}

async function main(){
  const gallery=JSON.parse(await readFile(galleryPath,'utf8'));
  if(gallery.schemaVersion!==3||!Array.isArray(gallery.assets))throw new Error('data/gallery.json 必须是 schemaVersion 3。');
  const index=JSON.parse(await readFile(indexPath,'utf8'));
  if(index.schemaVersion!==1||!index.assets)throw new Error('data/prompt-index.json 必须是 schemaVersion 1。');
  const targets=gallery.assets.filter(asset=>asset.domain==='character'&&(category==='all'||asset.category===category)&&(!family||(asset.tags||[]).includes(family)));
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
  const grouped=new Map();
  for(const asset of targets){
    const current=grouped.get(asset.category)||{done:0,total:0};
    current.total++;
    if(index.assets[asset.id])current.done++;
    grouped.set(asset.category,current);
  }
  await updateReadme(grouped);
  const totalDone=targets.filter(asset=>index.assets[asset.id]).length;
  console.log(`历史提示词回填完成：category=${category} family=${family||'-'} total=${targets.length} created=${created} indexed=${totalDone}`);
}

main().catch(error=>{console.error(error);process.exitCode=1;});
