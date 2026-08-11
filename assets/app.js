const ALL='all';
const LABELS={
  character:{'multi-panel':'多宫图',black:'黑色系',red:'红色系',pink:'粉色系',blue:'蓝色系',white:'白色系',purple:'紫色系',green:'绿色系',gold:'金色系',other:'其他'},
  color:{blue:'蓝色系',purple:'紫色系',pink:'粉色系',green:'绿色系',red:'红色系',orange:'橙黄色系',white:'白色系',black:'黑色系',mixed:'综合色系'},
  organ:{heart:'心脏',brain:'大脑',kidney:'肾脏',liver:'肝脏',lung:'肺',spleen:'脾脏',stomach:'胃',pancreas:'胰腺',vascular:'血管',genetics:'DNA / 基因',other:'其他医疗'}
};
const state={assets:[],visible:[],domain:'character',characterCategory:ALL,color:ALL,organ:ALL,unusedOnly:false,query:'',sort:'newest',activeIndex:-1,favorites:new Set(JSON.parse(localStorage.getItem('visual-asset-library:favorites')||'[]'))};
const $=(s)=>document.querySelector(s);
const el={grid:$('#galleryGrid'),template:$('#cardTemplate'),search:$('#searchInput'),sort:$('#sortSelect'),favoritesOnly:$('#favoritesOnly'),characterFilters:$('#characterFilters'),characterCategoryFilters:$('#characterCategoryFilters'),medicalFilters:$('#medicalFilters'),color:$('#colorFilter'),organ:$('#organFilter'),unusedOnly:$('#unusedOnly'),result:$('#resultText'),clear:$('#clearFilters'),empty:$('#emptyState'),assetCount:$('#assetCount'),characterCount:$('#characterCount'),kvCount:$('#kvCount'),theme:$('#themeToggle'),lightbox:$('#lightbox'),lightboxClose:$('#lightboxClose'),lightboxImage:$('#lightboxImage'),lightboxTitle:$('#lightboxTitle'),lightboxMeta:$('#lightboxMeta'),lightboxDetails:$('#lightboxDetails'),lightboxFavorite:$('#lightboxFavorite'),download:$('#downloadImage'),prev:$('#previousImage'),next:$('#nextImage')};

function assertAsset(a){
  if(!a||typeof a!=='object'||!a.id||!a.path||!a.title)throw new Error('发现缺少 id/path/title 的素材记录。');
  if(a.domain==='character'){if(!LABELS.character[a.category])throw new Error(`人物分类非法：${a.id}`);return;}
  if(a.domain==='medical-kv'){if(!LABELS.color[a.color]||!LABELS.organ[a.organ]||typeof a.used!=='boolean')throw new Error(`医药KV分类非法：${a.id}`);return;}
  throw new Error(`素材域非法：${a.id}`);
}
async function load(){
  const r=await fetch('./data/gallery.json',{cache:'no-store'});if(!r.ok)throw new Error(`索引读取失败：HTTP ${r.status}`);
  const payload=await r.json();if(payload.schemaVersion!==3||!Array.isArray(payload.assets))throw new Error('只支持 schemaVersion 3。');
  payload.assets.forEach(assertAsset);state.assets=payload.assets;renderStats();renderFilters();apply();
}
function renderStats(){el.assetCount.textContent=state.assets.length;el.characterCount.textContent=state.assets.filter(a=>a.domain==='character').length;el.kvCount.textContent=state.assets.filter(a=>a.domain==='medical-kv').length;}
function renderFilters(){
  const chars=state.assets.filter(a=>a.domain==='character');const counts=new Map();chars.forEach(a=>counts.set(a.category,(counts.get(a.category)||0)+1));
  el.characterCategoryFilters.replaceChildren();[[ALL,'全部'],...Object.entries(LABELS.character)].forEach(([value,label])=>{if(value!==ALL&&!counts.has(value))return;const b=document.createElement('button');b.type='button';b.className=value===state.characterCategory?'active':'';b.textContent=label;const c=document.createElement('span');c.textContent=value===ALL?chars.length:counts.get(value);b.append(c);b.onclick=()=>{state.characterCategory=value;renderFilters();apply();};el.characterCategoryFilters.append(b);});
  fillSelect(el.color,LABELS.color,'全部颜色',state.color);fillSelect(el.organ,LABELS.organ,'全部器官',state.organ);
}
function fillSelect(select,labels,allLabel,current){select.replaceChildren(new Option(allLabel,ALL));for(const [value,label] of Object.entries(labels))select.add(new Option(label,value));select.value=current;}
function domainLabel(a){return a.domain==='character'?(LABELS.character[a.category]||a.category):`${LABELS.organ[a.organ]} · ${LABELS.color[a.color]}`;}
function searchable(a){return [a.title,...(a.tags||[]),a.domain==='character'?LABELS.character[a.category]:LABELS.color[a.color],a.domain==='medical-kv'?LABELS.organ[a.organ]:''].filter(Boolean).join(' ').toLocaleLowerCase('zh-CN');}
function apply(){
  const q=state.query.trim().toLocaleLowerCase('zh-CN');const favOnly=el.favoritesOnly.getAttribute('aria-pressed')==='true';
  state.visible=state.assets.filter(a=>a.domain===state.domain).filter(a=>state.domain==='character'?state.characterCategory===ALL||a.category===state.characterCategory:(state.color===ALL||a.color===state.color)&&(state.organ===ALL||a.organ===state.organ)&&(!state.unusedOnly||!a.used)).filter(a=>!favOnly||state.favorites.has(a.id)).filter(a=>!q||searchable(a).includes(q)).sort((a,b)=>{if(state.sort==='title')return a.title.localeCompare(b.title,'zh-CN');const at=Date.parse(a.createdAt||0)||0,bt=Date.parse(b.createdAt||0)||0;return state.sort==='oldest'?at-bt:bt-at;});
  render();syncFilterVisibility();
}
function syncFilterVisibility(){el.characterFilters.hidden=state.domain!=='character';el.medicalFilters.hidden=state.domain!=='medical-kv';const has=state.query||state.characterCategory!==ALL||state.color!==ALL||state.organ!==ALL||state.unusedOnly||el.favoritesOnly.getAttribute('aria-pressed')==='true';el.clear.hidden=!has;}
function render(){
  el.grid.replaceChildren();state.visible.forEach((a,index)=>{const f=el.template.content.cloneNode(true),card=f.querySelector('.gallery-card'),btn=f.querySelector('.image-button'),img=f.querySelector('img'),meta=f.querySelector('.card-meta'),title=f.querySelector('.card-title'),dims=f.querySelector('.card-dimensions'),fav=f.querySelector('.favorite-button'),badge=f.querySelector('.usage-badge');
    const ratio=a.width>0&&a.height>0?a.width/a.height:1;card.dataset.assetId=a.id;card.dataset.domain=a.domain;card.style.setProperty('--ratio',String(Math.max(.55,Math.min(2.4,ratio))));if(ratio>=1.15)card.classList.add('is-landscape');
    img.src=encodeURI(a.thumbnail);if(a.thumbnailLarge){img.srcset=`${encodeURI(a.thumbnail)} 640w, ${encodeURI(a.thumbnailLarge)} ${a.thumbnailLargeWidth}w`;img.sizes=a.domain==='medical-kv'?'(min-width:1121px) 50vw, 100vw':'(min-width:1121px) 50vw, 100vw';}img.alt=a.title;img.loading=index<6?'eager':'lazy';img.fetchPriority=index<3?'high':'low';img.onerror=()=>{card.hidden=true;};
    meta.textContent=domainLabel(a);title.textContent=a.title;dims.textContent=a.width&&a.height?`${a.width} × ${a.height}`:'';btn.onclick=()=>openLightbox(index);syncFavorite(fav,a);fav.onclick=()=>toggleFavorite(a.id);
    if(a.domain==='medical-kv'){badge.hidden=false;badge.className=`usage-badge ${a.used?'used':'unused'}`;badge.textContent=a.used?'✓ 已使用':'● 未使用';}
    el.grid.append(f);
  });
  el.result.textContent=`显示 ${state.visible.length} / ${state.assets.filter(a=>a.domain===state.domain).length} 张素材`;el.empty.hidden=state.visible.length!==0;el.grid.hidden=state.visible.length===0;document.dispatchEvent(new CustomEvent('gallery:rendered'));
}
function syncFavorite(button,a){const on=state.favorites.has(a.id);button.textContent=on?'♥':'♡';button.setAttribute('aria-pressed',String(on));}
function toggleFavorite(id){state.favorites.has(id)?state.favorites.delete(id):state.favorites.add(id);localStorage.setItem('visual-asset-library:favorites',JSON.stringify([...state.favorites]));apply();if(el.lightbox.open)renderLightbox();}
function openLightbox(index){state.activeIndex=index;renderLightbox();el.lightbox.showModal();document.body.style.overflow='hidden';}
function renderLightbox(){const a=state.visible[state.activeIndex];if(!a)return;el.lightboxImage.src=encodeURI(a.path);el.lightboxImage.alt=a.title;el.lightboxTitle.textContent=a.title;el.lightboxMeta.textContent=domainLabel(a);el.lightboxDetails.textContent=[a.width&&a.height?`${a.width} × ${a.height}`:'',a.domain==='medical-kv'?(a.used?'已使用':'未使用'):''].filter(Boolean).join(' · ');el.download.href=encodeURI(a.path);el.download.download=a.path.split('/').pop();const on=state.favorites.has(a.id);el.lightboxFavorite.textContent=on?'♥ 已收藏':'♡ 收藏';el.prev.disabled=state.visible.length<2;el.next.disabled=state.visible.length<2;}
function move(delta){if(!state.visible.length)return;state.activeIndex=(state.activeIndex+delta+state.visible.length)%state.visible.length;renderLightbox();}
function clearFilters(){state.characterCategory=ALL;state.color=ALL;state.organ=ALL;state.unusedOnly=false;state.query='';el.search.value='';el.unusedOnly.setAttribute('aria-pressed','false');el.favoritesOnly.setAttribute('aria-pressed','false');renderFilters();apply();}
function setDomain(domain){state.domain=domain;document.querySelectorAll('.domain-tab').forEach(b=>b.classList.toggle('active',b.dataset.domain===domain));clearFilters();}
function patchAsset(id,patch){const a=state.assets.find(x=>x.id===id);if(!a)return;Object.assign(a,patch);apply();}
window.visualAssetLibrary={getAsset:(id)=>state.assets.find(a=>a.id===id),patchAsset,getDomain:()=>state.domain};
document.querySelectorAll('.domain-tab').forEach(b=>b.onclick=()=>setDomain(b.dataset.domain));el.search.oninput=e=>{state.query=e.target.value;apply();};el.sort.onchange=e=>{state.sort=e.target.value;apply();};el.color.onchange=e=>{state.color=e.target.value;apply();};el.organ.onchange=e=>{state.organ=e.target.value;apply();};el.unusedOnly.onclick=()=>{state.unusedOnly=!state.unusedOnly;el.unusedOnly.setAttribute('aria-pressed',String(state.unusedOnly));apply();};el.favoritesOnly.onclick=()=>{const on=el.favoritesOnly.getAttribute('aria-pressed')!=='true';el.favoritesOnly.setAttribute('aria-pressed',String(on));apply();};el.clear.onclick=clearFilters;el.lightboxClose.onclick=()=>el.lightbox.close();el.lightbox.addEventListener('close',()=>{document.body.style.overflow='';});el.prev.onclick=()=>move(-1);el.next.onclick=()=>move(1);el.lightboxFavorite.onclick=()=>{const a=state.visible[state.activeIndex];if(a)toggleFavorite(a.id);};document.addEventListener('keydown',e=>{if(e.key==='Escape'&&el.lightbox.open)el.lightbox.close();if(el.lightbox.open&&e.key==='ArrowLeft')move(-1);if(el.lightbox.open&&e.key==='ArrowRight')move(1);});
const savedTheme=localStorage.getItem('visual-asset-library:theme');if(savedTheme)document.documentElement.dataset.theme=savedTheme;el.theme.onclick=()=>{const next=document.documentElement.dataset.theme==='light'?'dark':'light';document.documentElement.dataset.theme=next;localStorage.setItem('visual-asset-library:theme',next);};
load().catch(err=>{console.error(err);el.result.textContent=`素材库加载失败：${err.message}`;});
