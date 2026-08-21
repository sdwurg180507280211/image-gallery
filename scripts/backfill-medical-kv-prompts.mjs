import {access,mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const galleryPath=path.join(root,'data','gallery.json');
const indexPath=path.join(root,'data','prompt-index.json');
const readmePath=path.join(root,'prompts','README.md');
const assetPromptDir=path.join(root,'prompts','assets');
const args=Object.fromEntries(process.argv.slice(2).map(value=>{const [key,...rest]=value.replace(/^--/,'').split('=');return [key,rest.join('=')||true];}));
const rewrite=args.rewrite===true||String(args.rewrite||'').toLowerCase()==='true';

const colorDescriptions={
  blue:'蓝白 / 浅蓝医疗科技方向，高明度、通透、理性、专业，以冷蓝渐变、玻璃质感和柔和科技光为主',
  purple:'蓝紫 / 紫粉慢病管理与未来医学方向，柔和未来感，使用紫蓝渐变、玻璃材质和克制的粉紫高光',
  pink:'粉白 / 浅红医学关怀方向，温暖但专业，避免甜腻少女风，以柔和粉白、玫红点缀和透明医学材质为主',
  green:'青绿 / 翡翠医疗科技方向，清洁、生命力和现代感并重，以青绿光、玻璃材质和低对比背景为主',
  red:'红白规范医学 / 心血管方向，以白灰底、红橙流线和局部红色医学主体形成专业强调，不使用压迫感大面积纯红',
  orange:'橙白医学路径与活力方向，以暖橙作为局部能量和路径强调色，背景保持洁净明亮',
  white:'白灰 / 银白高端医疗方向，强调透明、银灰、浅蓝或少量彩色医学主体，整体克制、精致、留白充足',
  black:'深蓝黑 / 深紫科技会议方向，以单一高亮医学视觉中心、粒子场和能量轨迹形成强对比，但不过度赛博朋克',
  mixed:'综合色彩医学概念方向，保留历史画面中的主次配色关系，只允许一个第一视觉中心，避免多色元素平均铺满画布'
};
const organDescriptions={
  heart:'心脏',brain:'大脑',kidney:'肾脏',liver:'肝脏',lung:'肺',spleen:'脾脏',stomach:'胃',pancreas:'胰腺',vascular:'血管 / 心血管系统',genetics:'DNA / 基因',other:'医学主题核心视觉'
};
const genericTags=new Set(['医学KV','医药KV','医疗科技','科技感','16:9','无文字','主KV','KV','底板','未使用']);
const keywordSubjects=[
  ['关节','关节医学结构'],['DNA','DNA / 基因'],['基因','DNA / 基因'],['心脏','心脏'],['大脑','大脑'],['脑','大脑'],['血管','血管 / 心血管系统'],
  ['家庭健康','家庭健康关怀场景'],['家庭','家庭健康关怀场景'],['里程碑','医学里程碑 / 进阶路径'],['阶梯','医学成长阶梯 / 进阶路径'],
  ['细胞','细胞医学结构'],['神经','神经网络 / 神经元'],['骑行','健康生活方式 / 骑行'],['护盾','医学护盾 / 健康保护核心']
];
function unique(values){return [...new Set(values.filter(Boolean))]}
function subjectFor(asset){
  if(asset.organ&&asset.organ!=='other')return organDescriptions[asset.organ]||asset.organ;
  const source=`${asset.title} ${(asset.tags||[]).join(' ')}`;
  const hit=keywordSubjects.find(([keyword])=>source.includes(keyword));
  return hit?.[1]||'医学主题核心视觉';
}
function usefulTags(asset){return unique((asset.tags||[]).filter(tag=>!genericTags.has(tag))).slice(0,8)}
function compositionFor(asset){
  const source=`${asset.title} ${(asset.tags||[]).join(' ')}`;
  if(/左侧留白|右侧主视觉|右侧主体/.test(source))return '左侧保留大面积安静标题呼吸区，主医学视觉集中在右侧或右中区域';
  if(/右侧留白|左侧主视觉|左侧主体/.test(source))return '右侧保留安静标题呼吸区，主医学视觉集中在左侧或左中区域';
  if(/深色|霓虹|能量核心|漩涡/.test(source)||asset.color==='black')return '采用深色科技偏心构图，只保留一个高亮能量中心，周围通过粒子、点阵与轨迹形成节奏';
  if(/中心|环轨|球体|轨道/.test(source))return '采用中心偏置主视觉，主体周围保持明显呼吸空间，环轨和辅助元素围绕主体形成柔和层次';
  return '采用成熟的偏心会议 KV 构图，在一侧或中部偏置主视觉，并在另一侧保留明显、低对比、可直接叠字的标题呼吸区';
}
function auxiliaryFor(asset,subject){
  const tags=usefulTags(asset).filter(tag=>!subject.includes(tag));
  return tags.length?tags.join('、'):'纤细流线、粒子、柔光、透明弧面与少量医学科技节点';
}
function renderPrompt(asset){
  const subject=subjectFor(asset);
  const tags=usefulTags(asset);
  const auxiliary=auxiliaryFor(asset,subject);
  const color=colorDescriptions[asset.color]||colorDescriptions.mixed;
  const composition=compositionFor(asset);
  const evidence=tags.length?tags.join('、'):'当前标题、颜色与医学主题元数据';
  return `# ${asset.title}\n\n> 提示词类型：reconstructed  \n> 资产类型：医药主 KV 底板  \n> 历史依据：当前 v3 元数据（${evidence}）+ 项目现行 \`prompts/medical-kv-16x9-base.md\` 视觉规范  \n> 说明：未发现可证明为原始逐字输入的提示词，因此本文件用于复现画面方向，不冒充原始 prompt。\n\n## 生成提示词\n\n生成一张高分辨率 16:9 医药品牌会议主 KV 无文字底板，复现“${asset.title}”的视觉方向。整体必须具有成熟医药品牌会议 KV 的品质：专业、现代、可信、精致、医学感明确、轻科技、品牌化，不做科普插画、信息图、医学教材图或普通素材拼贴。\n\n主医学主体为${subject}。只建立一个明确第一视觉中心；主体采用高质量半透明 3D、玻璃 / 晶体质感、柔和发光轮廓或精细医学线框表达，医学结构可信但视觉包装精致，不血腥、不做硬核解剖图。\n\n关键视觉语义与辅助元素参考：${auxiliary}。辅助元素控制在 2–4 类，以分子、细胞、DNA、ECG、粒子、医学节点、透明丝带、流线、柔光或场景剪影中的必要元素增强空间层次，但视觉权重始终低于主主体。\n\n整体配色：${color}。背景使用大面积低对比渐变、微雾与空气感，并结合少量轻波纹、纤细流线、点阵、粒子、透明弧面、柔光晕或能量弧，达到“近看丰富、远看干净”。\n\n构图：${composition}。必须保留一块明显、安静、低对比的标题与副标题呼吸区；标题区不出现高亮器官、粗线、密集分子、强光斑或复杂主体。主视觉与辅助元素不能平均铺满画布。\n\n画面动势使用 S 形流线、环抱式能量轨迹、弧形光带、透明丝带、粒子汇聚 / 弥散或路径推进中的少量方式完成，只负责连接背景与主视觉，不形成新的第一视觉中心。\n\n输出仅为底板：不要标题，不要任何文字、字母、数字、logo、医院标志、品牌标志、水印或排版占位框。优先最高原生分辨率；不做血腥解剖、不做卡通科普、不做满屏 HUD、不做廉价图库拼贴。\n`;
}
async function exists(file){try{await access(file);return true}catch{return false}}
async function updateReadme(done,total){
  let text=await readFile(readmePath,'utf8');
  const line=`- 医药 KV 总计：${done} / ${total} 已完成提示词归档，均为 \`reconstructed\`。`;
  if(/^- 医药 KV 总计：.*$/mu.test(text))text=text.replace(/^- 医药 KV 总计：.*$/mu,line);
  else text=`${text.trimEnd()}\n${line}\n`;
  await writeFile(readmePath,text,'utf8');
}
async function main(){
  const gallery=JSON.parse(await readFile(galleryPath,'utf8'));
  const index=JSON.parse(await readFile(indexPath,'utf8'));
  if(gallery.schemaVersion!==3||!Array.isArray(gallery.assets))throw new Error('data/gallery.json 必须是 schemaVersion 3。');
  if(index.schemaVersion!==1||!index.assets)throw new Error('data/prompt-index.json 必须是 schemaVersion 1。');
  const targets=gallery.assets.filter(asset=>asset.domain==='medical-kv');
  if(!targets.length)throw new Error('当前图库没有 medical-kv 素材。');
  await mkdir(assetPromptDir,{recursive:true});
  let created=0,rewritten=0;
  for(const asset of targets){
    const target=path.join(assetPromptDir,`${asset.id}.md`);
    const already=await exists(target)&&index.assets[asset.id];
    if(already&&!rewrite)continue;
    await writeFile(target,renderPrompt(asset),'utf8');
    index.assets[asset.id]={path:`prompts/assets/${asset.id}.md`,kind:'reconstructed'};
    already?rewritten++:created++;
  }
  await writeFile(indexPath,`${JSON.stringify(index,null,2)}\n`,'utf8');
  const done=targets.filter(asset=>index.assets[asset.id]).length;
  await updateReadme(done,targets.length);
  console.log(`医药 KV 提示词回填完成：total=${targets.length} created=${created} rewritten=${rewritten} indexed=${done}`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
