export function createLightbox({getItems,formatMeta,formatFacts,isFavorite,onToggleFavorite}){
  const dialog=document.querySelector('#lightbox');
  const el={
    close:document.querySelector('#lightboxClose'),image:document.querySelector('#lightboxImage'),stage:document.querySelector('#lightboxStage'),
    title:document.querySelector('#lightboxTitle'),meta:document.querySelector('#lightboxMeta'),counter:document.querySelector('#lightboxCounter'),
    status:document.querySelector('#lightboxStatus'),facts:document.querySelector('#lightboxFacts'),tags:document.querySelector('#lightboxTags'),
    favorite:document.querySelector('#lightboxFavorite'),download:document.querySelector('#downloadImage'),prev:document.querySelector('#previousImage'),next:document.querySelector('#nextImage')
  };
  let activeIndex=-1;
  let returnFocus=null;
  let pan=null;

  function setOrientation(asset){
    const ratio=asset.width/asset.height;
    dialog.classList.toggle('is-portrait',ratio<1);
    dialog.classList.toggle('is-landscape',ratio>=1.15);
    dialog.classList.toggle('is-square',ratio>=1&&ratio<1.15);
  }

  function resetPan(){
    pan=null;
    el.stage.classList.remove('is-panning');
  }

  function resetViewport(){
    requestAnimationFrame(()=>{
      el.stage.scrollLeft=Math.max(0,(el.stage.scrollWidth-el.stage.clientWidth)/2);
      el.stage.scrollTop=0;
    });
  }

  function render(){
    const items=getItems();
    if(!dialog.open||!items.length)return;
    resetPan();
    activeIndex=Math.max(0,Math.min(activeIndex,items.length-1));
    const asset=items[activeIndex];
    setOrientation(asset);
    el.counter.textContent=`${activeIndex+1} / ${items.length}`;
    el.meta.textContent=`${formatMeta(asset)} · 原尺寸 1:1`;
    el.title.textContent=asset.title;
    el.stage.classList.add('is-loading');
    el.image.onload=()=>{
      el.stage.classList.remove('is-loading');
      resetViewport();
    };
    el.image.onerror=()=>el.stage.classList.remove('is-loading');
    el.image.src=encodeURI(asset.path);
    el.image.alt=asset.title;
    el.download.href=encodeURI(asset.path);
    el.download.download=asset.path.split('/').pop();
    const favorite=isFavorite(asset.id);
    el.favorite.textContent=favorite?'♥ 已收藏':'♡ 收藏';
    el.favorite.setAttribute('aria-pressed',String(favorite));
    el.prev.disabled=items.length<2;
    el.next.disabled=items.length<2;
    if(asset.domain==='medical-kv'){
      el.status.hidden=false;
      el.status.className=`viewer-status ${asset.used?'used':'unused'}`;
      el.status.textContent=asset.used?'✓ 已使用':'● 未使用';
    }else{
      el.status.hidden=true;
    }
    el.facts.replaceChildren();
    for(const [label,value] of formatFacts(asset)){
      const dt=document.createElement('dt');
      const dd=document.createElement('dd');
      dt.textContent=label;
      dd.textContent=value;
      el.facts.append(dt,dd);
    }
    el.tags.replaceChildren();
    for(const tag of asset.tags||[]){
      const span=document.createElement('span');
      span.textContent=tag;
      el.tags.append(span);
    }
    el.tags.hidden=!el.tags.childElementCount;
  }

  function open(index,opener){
    const items=getItems();
    if(!items.length)return;
    activeIndex=Math.max(0,Math.min(index,items.length-1));
    returnFocus=opener||document.activeElement;
    dialog.showModal();
    document.body.style.overflow='hidden';
    render();
  }

  function close(){
    if(dialog.open)dialog.close();
  }

  function move(delta){
    const items=getItems();
    if(items.length<2)return;
    activeIndex=(activeIndex+delta+items.length)%items.length;
    render();
  }

  el.stage.addEventListener('pointerdown',event=>{
    if(event.pointerType!=='mouse'||event.button!==0)return;
    pan={id:event.pointerId,x:event.clientX,y:event.clientY,left:el.stage.scrollLeft,top:el.stage.scrollTop};
    el.stage.setPointerCapture?.(event.pointerId);
    el.stage.classList.add('is-panning');
  });

  el.stage.addEventListener('pointermove',event=>{
    if(!pan||pan.id!==event.pointerId)return;
    event.preventDefault();
    el.stage.scrollLeft=pan.left-(event.clientX-pan.x);
    el.stage.scrollTop=pan.top-(event.clientY-pan.y);
  });

  function finishPan(event){
    if(pan&&pan.id===event.pointerId)resetPan();
  }
  el.stage.addEventListener('pointerup',finishPan);
  el.stage.addEventListener('pointercancel',resetPan);

  el.close.onclick=close;
  el.prev.onclick=()=>move(-1);
  el.next.onclick=()=>move(1);
  el.favorite.onclick=()=>{
    const asset=getItems()[activeIndex];
    if(asset){
      onToggleFavorite(asset.id);
      render();
    }
  };
  dialog.addEventListener('click',event=>{if(event.target===dialog)close();});
  dialog.addEventListener('close',()=>{
    document.body.style.overflow='';
    resetPan();
    el.image.removeAttribute('src');
    dialog.classList.remove('is-portrait','is-landscape','is-square');
    const target=returnFocus;
    returnFocus=null;
    if(target?.isConnected)target.focus({preventScroll:true});
  });
  document.addEventListener('keydown',event=>{
    if(!dialog.open)return;
    if(event.key==='ArrowLeft'){
      event.preventDefault();
      move(-1);
    }
    if(event.key==='ArrowRight'){
      event.preventDefault();
      move(1);
    }
    if(event.key==='Escape'){
      event.preventDefault();
      close();
    }
  });

  return {open,refresh:render,isOpen:()=>dialog.open};
}
