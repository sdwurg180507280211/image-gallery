import {createLightbox} from './lightbox.js?v=10';
import {feedbackStore} from './feedback-store.js?v=1';

const ALL='all';
const FAVORITES_KEY='visual-asset-library:favorites';
const THEME_KEY='visual-asset-library:theme';
const LABELS={
  character:{'multi-panel':'多宫图',black:'黑色系',red:'红色系',pink:'粉色系',blue:'蓝色系',white:'白色系',purple:'紫色系',green:'绿色系',gold:'金色系',other:'其他'},
  organ:{heart:'心脏',brain:'大脑',kidney:'肾脏',liver:'肝脏',lung:'肺',spleen:'脾脏',stomach:'胃',pancreas:'胰腺',vascular:'血管',genetics:'DNA / 基因',other:'其他医疗'}
};

function readIdSet(key){
  try{
    const value=JSON.parse(localStorage.getItem(key)||'[]');
    return new Set(Array.isArray(value)?value.filter(x=>typeof x==='string'):[]);
  }catch{return new Set();}
}
function saveIdSet(key,set){localStorage.setItem(key,JSON.stringify([...set]));}

const state={
  assets:[],visible:[],domain:'character',characterCategory:ALL,seriesId:ALL,seriesView:false,query:'',sort:'newest',favoritesOnly:false,dislikedOnly:false,
  favorites:readIdSet(FAVORITES_KEY),dislikes:new Set()
};
const $=selector=>document.querySelector(selector);
const el={
  grid:$('#galleryGrid'),template:$('#cardTemplate'),search:$('#searchInput'),clearSearch:$('#clearSearch'),sort:$('#sortSelect'),seriesView:$('#seriesViewToggle'),favoritesOnly:$('#favoritesOnly'),dislikedOnly:$('#dislikedOnly'),
  characterFilters:$('#characterFilters'),characterCategoryFilters:$('#characterCategoryFilters'),
  result:$('#resultText'),activeFilters:$('#activeFilters'),clear:$('#clearFilters'),empty:$('#emptyState'),characterTabCount:$('#characterTabCount'),kvTabCount:$('#kvTabCount'),theme:$('#themeToggle')
};
let lightbox;

function assertAsset(asset){
  if(!asset||typeof asset!=='object'||!asset.id||!asset.path||!asset.title)throw new Error('发现缺少 id/path/title 的素材记录。');
  if(asset.domain==='character'){
    if(!LABELS.character[asset.category])throw new Error(`人物分类非法：${asset.id}`);
    if(!asset.characterId||!asset.seriesId||!asset.seriesSlug)throw new Error(`人物分组信息缺失：${asset.id}`);
    return;
  }
  if(asset.domain==='medical-kv'){
    if(!LABELS.organ[asset.organ])throw new Error(`医药KV分类非法：${asset.id}`);
    return;
  }
  throw new Error(`素材域非法：${asset.id}`);
}
function assertPromptIndex(payload){
  if(payload?.schemaVersion!==1||!payload.assets||typeof payload.assets!=='object'||Array.isArray(payload.assets))throw new Error('提示词索引格式非法。');
  for(const [id,prompt] of Object.entries(payload.assets))if(!id||!prompt?.path||!['original','reconstructed'].includes(prompt.kind))throw new Error(`提示词索引非法：${id}`);
}
function seedDislikes(payload,assetIds){
  if(payload?.schemaVersion!==1||!Array.isArray(payload.assetIds))return [];
  return payload.assetIds.filter(id=>assetIds.has(id));
}
function searchable(asset){
  return [asset.title,...(asset.tags||[]),asset.domain==='character'?LABELS.character[asset.category]:LABELS.organ[asset.organ],asset.characterId,asset.seriesSlug].filter(Boolean).join(' ').toLocaleLowerCase('zh-CN');
}
function matchesShared(asset){
  const q=state.query.trim().toLocaleLowerCase('zh-CN');
  const dislikeMatches=state.dislikedOnly?state.dislikes.has(asset.id):!state.dislikes.has(asset.id);
  return (!state.favoritesOnly||state.favorites.has(asset.id))&&dislikeMatches&&(!q||searchable(asset).includes(q));
}
function currentDomainAssets(){return state.assets.filter(asset=>asset.domain===state.domain);}
function sortAssets(items){
  return items.sort((a,b)=>{
    if(state.sort==='title')return a.title.localeCompare(b.title,'zh-CN');
    const at=Date.parse(a.createdAt||0)||0,bt=Date.parse(b.createdAt||0)||0;
    return state.sort==='oldest'?at-bt:bt-at;
  });
}
function matchesCharacterFacets(asset){
  if(asset.domain!=='character')return true;
  return (state.characterCategory===ALL||asset.category===state.characterCategory)&&(state.seriesId===ALL||asset.seriesId===state.seriesId);
}
function computeVisible(){return sortAssets(currentDomainAssets().filter(matchesShared).filter(matchesCharacterFacets));}
function countBy(items,key){const map=new Map();for(const item of items)map.set(item[key],(map.get(item[key])||0)+1);return map;}
function characterScope(){return state.assets.filter(asset=>asset.domain==='character').filter(matchesShared).filter(asset=>state.seriesId===ALL||asset.seriesId===state.seriesId);}
function domainLabel(asset){return asset.domain==='character'?(LABELS.character[asset.category]||asset.category):(LABELS.organ[asset.organ]||'医药KV');}
function characterLabel(asset){return asset.characterLabel||asset.tags?.[0]||asset.characterId||'人物';}
function formatSeriesSlug(slug){
  const value=String(slug||'').trim();
  const match=/^session-(\d{4})-(\d{2})-(\d{2})(?:-(.+))?$/.exec(value);
  if(match)return `${match[1]}-${match[2]}-${match[3]}${match[4]?` · ${match[4].replaceAll('-',' ')}`:''}`;
  return value.replaceAll('-',' ');
}
function seriesLabel(asset){return asset.seriesLabel||formatSeriesSlug(asset.seriesSlug)||'未命名系列';}
function createChip(container,value,label,onClick){
  const button=document.createElement('button');button.type='button';button.dataset.value=value;button.setAttribute('aria-pressed','false');
  const text=document.createElement('span');text.className='chip-label';text.textContent=label;
  const count=document.createElement('small');count.className='chip-count';
  button.append(text,count);button.onclick=()=>onClick(value);container.append(button);
}
function toggleFacet(current,value){return current===value?ALL:value;}
function buildFilterControls(){
  createChip(el.characterCategoryFilters,ALL,'全部',value=>{state.characterCategory=toggleFacet(state.characterCategory,value);apply();});
  for(const [value,label] of Object.entries(LABELS.character))createChip(el.characterCategoryFilters,value,label,v=>{state.characterCategory=toggleFacet(state.characterCategory,v);apply();});
}
function updateChipGroup(container,current,counts,total){
  container.querySelectorAll('button').forEach(button=>{
    const value=button.dataset.value,count=value===ALL?total:(counts.get(value)||0),selected=value===current;
    button.hidden=value!==ALL&&count===0&&!selected;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));button.querySelector('.chip-count').textContent=String(count);
  });
}
function updateFilterControls(){
  const chars=characterScope();updateChipGroup(el.characterCategoryFilters,state.characterCategory,countBy(chars,'category'),chars.length);
}
function renderCounts(){
  el.characterTabCount.textContent=String(state.assets.filter(asset=>asset.domain==='character').length);
  el.kvTabCount.textContent=String(state.assets.filter(asset=>asset.domain==='medical-kv').length);
}
function syncDomainTabs(){
  document.querySelectorAll('.domain-tab').forEach(button=>{
    const active=button.dataset.domain===state.domain;
    button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));
  });
}
function syncControls(){
  el.characterFilters.hidden=state.domain!=='character';
  el.seriesView.hidden=state.domain!=='character';el.seriesView.setAttribute('aria-pressed',String(state.seriesView));
  el.search.placeholder=state.domain==='character'?'搜索人物标题或关键词…':'搜索KV标题或关键词…';el.clearSearch.hidden=!state.query;
  el.favoritesOnly.setAttribute('aria-pressed',String(state.favoritesOnly));el.favoritesOnly.textContent=state.favoritesOnly?'♥ 收藏':'♡ 收藏';
  el.dislikedOnly.setAttribute('aria-pressed',String(state.dislikedOnly));el.dislikedOnly.textContent=state.dislikedOnly?`👎 不喜欢 ${state.dislikes.size}`:'👎 不喜欢';
  syncDomainTabs();
  el.clear.hidden=!(state.query||state.favoritesOnly||state.dislikedOnly||state.characterCategory!==ALL||state.seriesId!==ALL);
}
function renderActiveFilters(){
  el.activeFilters.replaceChildren();const filters=[];
  if(state.favoritesOnly)filters.push(['收藏',()=>{state.favoritesOnly=false;apply();}]);
  if(state.dislikedOnly)filters.push(['不喜欢',()=>{state.dislikedOnly=false;apply();}]);
  if(state.domain==='character'&&state.characterCategory!==ALL)filters.push([LABELS.character[state.characterCategory],()=>{state.characterCategory=ALL;apply();}]);
  if(state.domain==='character'&&state.seriesId!==ALL){
    const selected=state.assets.find(asset=>asset.seriesId===state.seriesId);
    filters.push([`系列：${selected?seriesLabel(selected):state.seriesId}`,()=>{state.seriesId=ALL;apply();}]);
  }
  for(const [label,remove] of filters){const button=document.createElement('button');button.type='button';button.textContent=`${label} ×`;button.onclick=remove;el.activeFilters.append(button);}
  el.activeFilters.hidden=!filters.length;
}
function syncFavoriteButton(button,id){
  const active=state.favorites.has(id);button.textContent=active?'♥':'♡';button.setAttribute('aria-pressed',String(active));button.title=active?'取消收藏':'收藏';
}
function syncDislikeButton(button,id){
  const active=state.dislikes.has(id);button.textContent='👎';button.setAttribute('aria-pressed',String(active));button.setAttribute('aria-label',active?'取消不喜欢标记':'标记不喜欢');button.title=active?'取消不喜欢标记':'标记不喜欢';
}
function toggleFavorite(id){state.favorites.has(id)?state.favorites.delete(id):state.favorites.add(id);saveIdSet(FAVORITES_KEY,state.favorites);apply();}
function restoreScrollPosition(top){
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const maxTop=Math.max(0,document.documentElement.scrollHeight-window.innerHeight);
    window.scrollTo({top:Math.min(top,maxTop),left:0,behavior:'auto'});
  }));
}
function toggleDislike(id){
  const scrollTop=window.scrollY;
  feedbackStore.toggleDisliked(id);state.dislikes=new Set(feedbackStore.getDislikedIds());apply();restoreScrollPosition(scrollTop);
}
function applyImage(card,image,asset,index){
  const ratio=asset.width>0&&asset.height>0?asset.width/asset.height:1;
  card.style.setProperty('--ratio',String(Math.max(.55,Math.min(2.4,ratio))));if(ratio>=1.15)card.classList.add('is-landscape');
  image.onload=()=>card.classList.add('image-ready');image.onerror=()=>{card.hidden=true;};image.alt=asset.title;image.loading=index<8?'eager':'lazy';image.fetchPriority=index<4?'high':'low';image.src=encodeURI(asset.thumbnail);
  if(asset.thumbnailLarge){image.srcset=`${encodeURI(asset.thumbnail)} 640w, ${encodeURI(asset.thumbnailLarge)} ${asset.thumbnailLargeWidth}w`;image.sizes=asset.domain==='medical-kv'?'(min-width:1100px) 44vw, 100vw':'(min-width:1400px) 20vw, (min-width:900px) 25vw, 50vw';}
  if(image.complete&&image.naturalWidth)card.classList.add('image-ready');
}
function groupSeries(items){
  const groups=new Map();
  for(const asset of items){
    let group=groups.get(asset.seriesId);
    if(!group){group={id:asset.seriesId,label:seriesLabel(asset),character:characterLabel(asset),assets:[],cover:asset};groups.set(asset.seriesId,group);}
    group.assets.push(asset);
  }
  return [...groups.values()];
}
function renderSeries(){
  const groups=groupSeries(state.visible);
  groups.forEach((series,index)=>{
    const fragment=el.template.content.cloneNode(true),card=fragment.querySelector('.gallery-card'),button=fragment.querySelector('.image-button'),image=fragment.querySelector('img'),overlay=fragment.querySelector('.image-overlay'),meta=fragment.querySelector('.card-meta'),title=fragment.querySelector('.card-title'),actions=fragment.querySelector('.card-actions');
    card.dataset.seriesId=series.id;card.dataset.domain='character';card.classList.add('series-card');
    applyImage(card,image,series.cover,index);overlay.textContent='查看系列';meta.textContent=`${series.character} · ${series.assets.length} 张`;title.textContent=series.label;actions.hidden=true;
    button.onclick=()=>{state.seriesId=series.id;state.seriesView=false;apply();window.scrollTo({top:0,behavior:'smooth'});};
    el.grid.append(fragment);
  });
  el.result.textContent=`${groups.length} 个系列 · ${state.visible.length} 张图片`;
  el.empty.hidden=groups.length!==0;el.grid.hidden=groups.length===0;
}
function renderAssets(){
  state.visible.forEach((asset,index)=>{
    const fragment=el.template.content.cloneNode(true),card=fragment.querySelector('.gallery-card'),button=fragment.querySelector('.image-button'),image=fragment.querySelector('img'),meta=fragment.querySelector('.card-meta'),title=fragment.querySelector('.card-title'),favorite=fragment.querySelector('.favorite-button'),dislike=fragment.querySelector('.dislike-button');
    card.dataset.assetId=asset.id;card.dataset.domain=asset.domain;card.classList.toggle('is-disliked',state.dislikes.has(asset.id));
    applyImage(card,image,asset,index);
    if(asset.domain==='medical-kv'||card.classList.contains('is-landscape'))image.style.objectFit='contain';
    meta.textContent=domainLabel(asset);title.textContent=asset.title;button.onclick=()=>lightbox.open(index,button);
    syncFavoriteButton(favorite,asset.id);favorite.onclick=()=>toggleFavorite(asset.id);
    syncDislikeButton(dislike,asset.id);dislike.onclick=()=>toggleDislike(asset.id);
    el.grid.append(fragment);
  });
  const total=currentDomainAssets().length;
  el.result.textContent=`${state.visible.length} / ${total}`;
  el.empty.hidden=state.visible.length!==0;el.grid.hidden=state.visible.length===0;
}
function render(){el.grid.replaceChildren();if(state.domain==='character'&&state.seriesView)renderSeries();else renderAssets();}
function apply(){state.visible=computeVisible();updateFilterControls();syncControls();renderActiveFilters();render();if(lightbox?.isOpen())lightbox.refresh();}
function clearFilters(){state.characterCategory=ALL;state.seriesId=ALL;state.query='';state.favoritesOnly=false;state.dislikedOnly=false;el.search.value='';apply();}
function setDomain(domain){
  if(!['character','medical-kv'].includes(domain)||domain===state.domain)return;
  state.domain=domain;state.characterCategory=ALL;state.seriesId=ALL;state.seriesView=false;apply();
}
function toggleSeriesView(){
  if(state.domain!=='character')return;
  state.seriesView=!state.seriesView;
  if(state.seriesView)state.seriesId=ALL;
  apply();
}
async function load(){
  const [response,promptResponse,seedResponse]=await Promise.all([
    fetch('./data/gallery.json',{cache:'no-store'}),
    fetch('./data/prompt-index.json',{cache:'no-store'}),
    fetch('./data/dislikes.json',{cache:'no-store'}).catch(()=>null)
  ]);
  if(!response.ok)throw new Error(`索引读取失败：HTTP ${response.status}`);
  if(!promptResponse.ok)throw new Error(`提示词索引读取失败：HTTP ${promptResponse.status}`);
  const payload=await response.json(),promptPayload=await promptResponse.json();
  if(payload.schemaVersion!==3||!Array.isArray(payload.assets))throw new Error('只支持 schemaVersion 3。');
  assertPromptIndex(promptPayload);payload.assets.forEach(assertAsset);
  const assetIds=new Set(payload.assets.map(asset=>asset.id));
  let seed=[];
  if(seedResponse?.ok)seed=seedDislikes(await seedResponse.json(),assetIds);
  await feedbackStore.init({validAssetIds:assetIds,seedAssetIds:seed});
  state.dislikes=new Set(feedbackStore.getDislikedIds());
  state.favorites=new Set([...state.favorites].filter(id=>assetIds.has(id)));saveIdSet(FAVORITES_KEY,state.favorites);
  state.assets=payload.assets.map(asset=>{const prompt=promptPayload.assets[asset.id];return {...asset,...(prompt?{promptPath:prompt.path,promptKind:prompt.kind}:{})};});
  buildFilterControls();renderCounts();
  lightbox=createLightbox({getItems:()=>state.visible,formatMeta:domainLabel,isFavorite:id=>state.favorites.has(id),onToggleFavorite:toggleFavorite,isDisliked:id=>state.dislikes.has(id),onToggleDislike:toggleDislike});
  apply();
}

window.visualAssetLibrary={getAsset:id=>state.assets.find(asset=>asset.id===id),getDomain:()=>state.domain,getDislikedIds:()=>feedbackStore.getDislikedIds(),getSeriesId:()=>state.seriesId};
document.querySelectorAll('.domain-tab[data-domain="character"],.domain-tab[data-domain="medical-kv"]').forEach(button=>button.addEventListener('click',()=>setDomain(button.dataset.domain)));
el.search.addEventListener('input',event=>{state.query=event.target.value;apply();});
el.clearSearch.addEventListener('click',()=>{state.query='';el.search.value='';el.search.focus();apply();});
el.sort.addEventListener('change',event=>{state.sort=event.target.value;apply();});
el.seriesView.addEventListener('click',toggleSeriesView);
el.favoritesOnly.addEventListener('click',()=>{state.favoritesOnly=!state.favoritesOnly;apply();});
el.dislikedOnly.addEventListener('click',()=>{state.dislikedOnly=!state.dislikedOnly;apply();});
el.clear.addEventListener('click',clearFilters);

const savedTheme=localStorage.getItem(THEME_KEY);
if(savedTheme==='light'||savedTheme==='dark')document.documentElement.dataset.theme=savedTheme;
function syncThemeButton(){el.theme.textContent=document.documentElement.dataset.theme==='light'?'☾':'☀';}
el.theme.addEventListener('click',()=>{const next=document.documentElement.dataset.theme==='light'?'dark':'light';document.documentElement.dataset.theme=next;localStorage.setItem(THEME_KEY,next);syncThemeButton();});
syncThemeButton();

load().catch(error=>{console.error(error);el.result.textContent=error.message;el.empty.hidden=false;el.empty.querySelector('strong').textContent='素材读取失败';el.empty.querySelector('p').textContent='请检查构建结果或刷新页面重试。';});
