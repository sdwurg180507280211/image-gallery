export function createLightbox({getItems,formatMeta,formatFacts,isFavorite,onToggleFavorite}){
  const dialog=document.querySelector('#lightbox');
  const el={
    close:document.querySelector('#lightboxClose'),image:document.querySelector('#lightboxImage'),stage:document.querySelector('#lightboxStage'),
    title:document.querySelector('#lightboxTitle'),meta:document.querySelector('#lightboxMeta'),counter:document.querySelector('#lightboxCounter'),
    status:document.querySelector('#lightboxStatus'),facts:document.querySelector('#lightboxFacts'),tags:document.querySelector('#lightboxTags'),
    favorite:document.querySelector('#lightboxFavorite'),download:document.querySelector('#downloadImage'),prev:document.querySelector('#previousImage'),next:document.querySelector('#nextImage')
  };
  let activeIndex=-1;let returnFocus=null;

  function render(){
    const items=getItems();
    if(!dialog.open||!items.length)return;
    activeIndex=Math.max(0,Math.min(activeIndex,items.length-1));
    const asset=items[activeIndex];
    el.counter.textContent=`${activeIndex+1} / ${items.length}`;
    el.meta.textContent=formatMeta(asset);
    el.title.textContent=asset.title;
    el.stage.classList.add('is-loading');
    el.image.onload=()=>el.stage.classList.remove('is-loading');
    el.image.onerror=()=>el.stage.classList.remove('is-loading');
    el.image.src=encodeURI(asset.path);el.image.alt=asset.title;
    el.download.href=encodeURI(asset.path);el.download.download=asset.path.split('/').pop();
    const favorite=isFavorite(asset.id);el.favorite.textContent=favorite?'♥ 已收藏':'♡ 收藏';el.favorite.setAttribute('aria-pressed',String(favorite));
    el.prev.disabled=items.length<2;el.next.disabled=items.length<2;
    if(asset.domain==='medical-kv'){
      el.status.hidden=false;el.status.className=`viewer-status ${asset.used?'used':'unused'}`;el.status.textContent=asset.used?'✓ 已使用':'● 未使用';
    }else el.status.hidden=true;
    el.facts.replaceChildren();
    for(const [label,value] of formatFacts(asset)){
      const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;el.facts.append(dt,dd);
    }
    el.tags.replaceChildren();
    for(const tag of asset.tags||[]){const span=document.createElement('span');span.textContent=tag;el.tags.append(span);}
    el.tags.hidden=!el.tags.childElementCount;
  }
  function open(index,opener){const items=getItems();if(!items.length)return;activeIndex=Math.max(0,Math.min(index,items.length-1));returnFocus=opener||document.activeElement;dialog.showModal();document.body.style.overflow='hidden';render();}
  function close(){if(dialog.open)dialog.close();}
  function move(delta){const items=getItems();if(items.length<2)return;activeIndex=(activeIndex+delta+items.length)%items.length;render();}
  el.close.onclick=close;el.prev.onclick=()=>move(-1);el.next.onclick=()=>move(1);el.favorite.onclick=()=>{const asset=getItems()[activeIndex];if(asset){onToggleFavorite(asset.id);render();}};
  dialog.addEventListener('click',event=>{if(event.target===dialog)close();});
  dialog.addEventListener('close',()=>{document.body.style.overflow='';el.image.removeAttribute('src');const target=returnFocus;returnFocus=null;if(target?.isConnected)target.focus({preventScroll:true});});
  document.addEventListener('keydown',event=>{if(!dialog.open)return;if(event.key==='ArrowLeft'){event.preventDefault();move(-1);}if(event.key==='ArrowRight'){event.preventDefault();move(1);}if(event.key==='Escape'){event.preventDefault();close();}});
  return {open,refresh:render,isOpen:()=>dialog.open};
}
