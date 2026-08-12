import {createLightbox} from './lightbox.js';

const ALL='all';
const LABELS={
  character:{'multi-panel':'多宫图',black:'黑色系',red:'红色系',pink:'粉色系',blue:'蓝色系',white:'白色系',purple:'紫色系',green:'绿色系',gold:'金色系',other:'其他'},
  color:{blue:'蓝色系',purple:'紫色系',pink:'粉色系',green:'绿色系',red:'红色系',orange:'橙黄色系',white:'白色系',black:'黑色系',mixed:'综合色系'},
  organ:{heart:'心脏',brain:'大脑',kidney:'肾脏',liver:'肝脏',lung:'肺',spleen:'脾脏',stomach:'胃',pancreas:'胰腺',vascular:'血管',genetics:'DNA / 基因',other:'其他医疗'}
};
const state={assets:[],visible:[],domain:'character',characterCategory:ALL,color:ALL,organ:ALL,usage:ALL,query:'',sort:'newest',favoritesOnly:false,favorites:new Set(JSON.parse(localStorage.getItem('visual-asset-library:favorites')||'[]'))};
const $=selector=>document.querySelector(selector);
const el={
  grid:$('#galleryGrid'),template:$('#cardTemplate'),search:$('#searchInput'),clearSearch:$('#clearSearch'),sort:$('#sortSelect'),favoritesOnly:$('#favoritesOnly'),
  characterFilters:$('#characterFilters'),characterCategoryFilters:$('#characterCategoryFilters'),medicalFilters:$('#medicalFilters'),colorFilters:$('#colorFilters'),organFilters:$('#organFilters'),usageFilters:$('#usageFilters'),
  result:$('#resultText'),activeFilters:$('#activeFilters'),clear:$('#clearFilters'),empty:$('#emptyState'),assetCount:$('#assetCount'),characterCount:$('#characterCount'),kvCount:$('#kvCount'),characterTabCount:$('#characterTabCount'),kvTabCount:$('#kvTabCount'),theme:$('#themeToggle')
};
let lightbox;

function assertAsset(asset){
  if(!asset||typeof asset!=='object'||!asset.id||!asset.path||!asset.title)throw new Error('发现缺少 id/path/title 的素材记录。');
  if(asset.domain==='character'){if(!LABELS.character[asset.category])throw new Error(`人物分类非法：${asset.id}`);return;}
  if(asset.domain==='medical-kv'){if(!LABELS.color[asset.color]||!LABELS.organ[asset.organ]||typeof asset.used!=='boolean')throw new Error(`医药KV分类非法：${asset.id}`);return;}
  throw new Error(`素材域非法：${asset.id}`);
}
function searchable(asset){return [asset.title,...(asset.tags||[]),asset.domain==='character'?LABELS.character[asset.category]:LABELS.color[asset.color],asset.domain==='medical-kv'?LABELS.organ[asset.organ]:''].filter(Boolean).join(' ').toLocaleLowerCase('zh-CN');}
function matchesShared(asset){const q=state.query.trim().toLocaleLowerCase('zh-CN');return (!state.favoritesOnly||state.favorites.has(asset.id))&&(!q||searchable(asset).includes(q));}
function matchesUsage(asset){return state.usage===ALL||(state.usage==='used'?asset.used:!asset.used);}
function currentDomainAssets(){return state.assets.filter(asset=>asset.domain===state.domain);}
function sortAssets(items){return items.sort((a,b)=>{if(state.sort==='title')return a.title.localeCompare(b.title,'zh-CN');const at=Date.parse(a.createdAt||0)||0,bt=Date.parse(b.createdAt||0)||0;return state.sort==='oldest'?at-bt:bt-at;});}
function computeVisible(){return sortAssets(currentDomainAssets().filter(matchesShared).filter(asset=>state.domain==='character'?state.characterCategory===ALL||asset.category===state.characterCategory:(state.color===ALL||asset.color===state.color)&&(state.organ===ALL||asset.organ===state.organ)&&matchesUsage(asset)));}
function countBy(items,key){const map=new Map();for(const item of items)map.set(item[key],(map.get(item[key])||0)+1);return map;}
function medicalScope(skip){return state.assets.filter(asset=>asset.domain==='medical-kv').filter(matchesShared).filter(asset=>skip==='color'||state.color===ALL||asset.color===state.color).filter(asset=>skip==='organ'||state.organ===ALL||asset.organ===state.organ).filter(asset=>skip==='usage'||matchesUsage(asset));}
function characterScope(){return state.assets.filter(asset=>asset.domain==='character').filter(matchesShared);}
function domainLabel(asset){return asset.domain==='character'?(LABELS.character[asset.category]||asset.category):`${LABELS.organ[asset.organ]} · ${LABELS.color[asset.color]}`;}
function formatDate(value){const time=Date.parse(value||'');if(!Number.isFinite(time))return '';return new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'short',day:'numeric'}).format(time);}
function assetFacts(asset){
  const facts=[];if(asset.width&&asset.height)facts.push(['尺寸',`${asset.width} × ${asset.height}`]);
  if(asset.domain==='character')facts.push(['分类',LABELS.character[asset.category]]);else{facts.push(['主色',LABELS.color[asset.color]],['主器官',LABELS.organ[asset.organ]],['状态',asset.used?'已使用':'未使用']);}
  const date=formatDate(asset.createdAt);if(date)facts.push(['入库',date]);return facts;
}
function createChip(container,value,label,onClick){const button=document.createElement('button');button.type='button';button.dataset.value=value;button.setAttribute('aria-pressed','false');const text=document.createElement('span');text.className='chip-label';text.textContent=label;const count=document.createElement('small');count.className='chip-count';button.append(text,count);button.onclick=()=>onClick(value);container.append(button);return button;}
function buildFilterControls(){
  createChip(el.characterCategoryFilters,ALL,'全部',value=>{state.characterCategory=value;apply();});for(const [value,label] of Object.entries(LABELS.character))createChip(el.characterCategoryFilters,value,label,v=>{state.characterCategory=v;apply();});
  createChip(el.colorFilters,ALL,'全部颜色',value=>{state.color=value;apply();});for(const [value,label] of Object.entries(LABELS.color))createChip(el.colorFilters,value,label,v=>{state.color=v;apply();});
  createChip(el.organFilters,ALL,'全部器官',value=>{state.organ=value;apply();});for(const [value,label] of Object.entries(LABELS.organ))createChip(el.organFilters,value,label,v=>{state.organ=v;apply();});
  for(const [value,label] of [[ALL,'全部'],['unused','未使用'],['used','已使用']])createChip(el.usageFilters,value,label,v=>{state.usage=v;apply();});
}
function updateChipGroup(container,current,counts,total){
  container.querySelectorAll('button').forEach(button=>{const value=button.dataset.value,count=value===ALL?total:(counts.get(value)||0);const selected=value===current;button.hidden=value!==ALL&&count===0&&!selected;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));button.querySelector('.chip-count').textContent=String(count);});
}
function updateFilterControls(){
  const charScope=characterScope();updateChipGroup(el.characterCategoryFilters,state.characterCategory,countBy(charScope,'category'),charScope.length);
  const colorScope=medicalScope('color');updateChipGroup(el.colorFilters,state.color,countBy(colorScope,'color'),colorScope.length);
  const organScope=medicalScope('organ');updateChipGroup(el.organFilters,state.organ,countBy(organScope,'organ'),organScope.length);
  const usageScope=medicalScope('usage'),usageCounts=new Map([['unused',usageScope.filter(asset=>!asset.used).length],['used',usageScope.filter(asset=>asset.used).length]]);updateChipGroup(el.usageFilters,state.usage,usageCounts,usageScope.length);
}
function renderStats(){const characters=state.assets.filter(asset=>asset.domain==='character').length,kvs=state.assets.filter(asset=>asset.domain==='medical-kv').length;el.assetCount.textContent=state.assets.length;el.characterCount.textContent=characters;el.kvCount.textContent=kvs;el.characterTabCount.textContent=characters;el.kvTabCount.textContent=kvs;}
function syncControls(){
  el.characterFilters.hidden=state.domain!=='character';el.medicalFilters.hidden=state.domain!=='medical-kv';el.search.placeholder=state.domain==='character'?'搜索人物标题或关键词…':'搜索KV标题、器官或关键词…';el.clearSearch.hidden=!state.query;
  el.favoritesOnly.setAttribute('aria-pressed',String(state.favoritesOnly));el.favoritesOnly.textContent=state.favoritesOnly?'♥ 只看收藏':'♡ 只看收藏';
  document.querySelectorAll('.domain-tab').forEach(button=>{const active=button.dataset.domain===state.domain;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));});
  const has=state.query||state.favoritesOnly||state.characterCategory!==ALL||state.color!==ALL||state.organ!==ALL||state.usage!==ALL;el.clear.hidden=!has;
}
function renderActiveFilters(){
  el.activeFilters.replaceChildren();const filters=[];
  if(state.domain==='character'&&state.characterCategory!==ALL)filters.push([LABELS.character[state.characterCategory],()=>{state.characterCategory=ALL;apply();}]);
  if(state.domain==='medical-kv'){
    if(state.color!==ALL)filters.push([LABELS.color[state.color],()=>{state.color=ALL;apply();}]);
    if(state.organ!==ALL)filters.push([LABELS.organ[state.organ],()=>{state.organ=ALL;apply();}]);
    if(state.usage!==ALL)filters.push([state.usage==='used'?'已使用':'未使用',()=>{state.usage=ALL;apply();}]);
  }
  for(const [label,remove] of filters){const button=document.createElement('button');button.type='button';button.textContent=`${label} ×`;button.onclick=remove;el.activeFilters.append(button);}el.activeFilters.hidden=!filters.length;
}
function syncFavoriteButton(button,id){const favorite=state.favorites.has(id);button.textContent=favorite?'♥':'♡';button.setAttribute('aria-pressed',String(favorite));}
function refreshFavoriteUI(id){document.querySelectorAll(`.gallery-card[data-asset-id="${CSS.escape(id)}"] .favorite-button`).forEach(button=>syncFavoriteButton(button,id));lightbox?.refresh();}
function toggleFavorite(id){state.favorites.has(id)?state.favorites.delete(id):state.favorites.add(id);localStorage.setItem('visual-asset-library:favorites',JSON.stringify([...state.favorites]));if(state.favoritesOnly)apply();else{refreshFavoriteUI(id);updateFilterControls();}}
function render(){
  el.grid.replaceChildren();state.visible.forEach((asset,index)=>{const fragment=el.template.content.cloneNode(true),card=fragment.querySelector('.gallery-card'),button=fragment.querySelector('.image-button'),image=fragment.querySelector('img'),meta=fragment.querySelector('.card-meta'),title=fragment.querySelector('.card-title'),dimensions=fragment.querySelector('.card-dimensions'),favorite=fragment.querySelector('.favorite-button'),badge=fragment.querySelector('.usage-badge');
    const ratio=asset.width>0&&asset.height>0?asset.width/asset.height:1;card.dataset.assetId=asset.id;card.dataset.domain=asset.domain;card.style.setProperty('--ratio',String(Math.max(.55,Math.min(2.4,ratio))));if(ratio>=1.15)card.classList.add('is-landscape');
    image.src=encodeURI(asset.thumbnail);if(asset.thumbnailLarge){image.srcset=`${encodeURI(asset.thumbnail)} 640w, ${encodeURI(asset.thumbnailLarge)} ${asset.thumbnailLargeWidth}w`;image.sizes=asset.domain==='medical-kv'?'(min-width:1121px) 50vw, 100vw':'(min-width:1121px) 50vw, 100vw';}image.alt=asset.title;image.loading=index<6?'eager':'lazy';image.fetchPriority=index<3?'high':'low';image.onload=()=>card.classList.add('image-ready');image.onerror=()=>{card.hidden=true;};
    meta.textContent=domainLabel(asset);title.textContent=asset.title;dimensions.textContent=asset.width&&asset.height?`${asset.width} × ${asset.height}`:'';button.onclick=()=>lightbox.open(index,button);syncFavoriteButton(favorite,asset.id);favorite.onclick=()=>toggleFavorite(asset.id);
    if(asset.domain==='medical-kv'){badge.hidden=false;badge.className=`usage-badge ${asset.used?'used':'unused'}`;badge.textContent=asset.used?'✓ 已使用':'● 未使用';}
    el.grid.append(fragment);
  });
  const total=currentDomainAssets().length;el.result.textContent=`显示 ${state.visible.length} / ${total} 张${state.domain==='character'?'人物图片':'医药 KV'}`;el.empty.hidden=state.visible.length!==0;el.grid.hidden=state.visible.length===0;document.dispatchEvent(new CustomEvent('gallery:rendered'));
}
function apply(){state.visible=computeVisible();updateFilterControls();syncControls();renderActiveFilters();render();if(lightbox?.isOpen())lightbox.refresh();}
function clearFilters(){state.characterCategory=ALL;state.color=ALL;state.organ=ALL;state.usage=ALL;state.query='';state.favoritesOnly=false;el.search.value='';apply();}
function setDomain(domain){if(domain===state.domain)return;state.domain=domain;state.characterCategory=ALL;state.color=ALL;state.organ=ALL;state.usage=ALL;apply();}
function patchAsset(id,patch){const asset=state.assets.find(item=>item.id===id);if(!asset)return;Object.assign(asset,patch);apply();}
async function load(){
  const response=await fetch('./data/gallery.json',{cache:'no-store'});if(!response.ok)throw new Error(`索引读取失败：HTTP ${response.status}`);
  const payload=await response.json();if(payload.schemaVersion!==3||!Array.isArray(payload.assets))throw new Error('只支持 schemaVersion 3。');payload.assets.forEach(assertAsset);state.assets=payload.assets;
  buildFilterControls();renderStats();lightbox=createLightbox({getItems:()=>state.visible,formatMeta:domainLabel,formatFacts:assetFacts,isFavorite:id=>state.favorites.has(id),onToggleFavorite:toggleFavorite});apply();
}
window.visualAssetLibrary={getAsset:id=>state.assets.find(asset=>asset.id===id),patchAsset,getDomain:()=>state.domain};
document.querySelectorAll('.domain-tab').forEach(button=>button.onclick=()=>setDomain(button.dataset.domain));
el.search.oninput=event=>{state.query=event.target.value;apply();};el.clearSearch.onclick=()=>{state.query='';el.search.value='';el.search.focus();apply();};el.sort.onchange=event=>{state.sort=event.target.value;apply();};el.favoritesOnly.onclick=()=>{state.favoritesOnly=!state.favoritesOnly;apply();};el.clear.onclick=clearFilters;
const savedTheme=localStorage.getItem('visual-asset-library:theme');if(savedTheme)document.documentElement.dataset.theme=savedTheme;el.theme.onclick=()=>{const next=document.documentElement.dataset.theme==='light'?'dark':'light';document.documentElement.dataset.theme=next;localStorage.setItem('visual-asset-library:theme',next);};
document.addEventListener('keydown',event=>{if(event.key==='/'&&!lightbox?.isOpen()&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){event.preventDefault();el.search.focus();}});
load().catch(error=>{console.error(error);el.result.textContent=`素材库加载失败：${error.message}`;});
