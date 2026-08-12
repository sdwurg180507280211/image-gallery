export function createLightbox({getItems,formatMeta,formatFacts,isFavorite,onToggleFavorite}){
  const dialog=document.querySelector('#lightbox');
  const stageWrap=document.querySelector('.viewer-stage-wrap');
  const el={
    close:document.querySelector('#lightboxClose'),image:document.querySelector('#lightboxImage'),stage:document.querySelector('#lightboxStage'),
    title:document.querySelector('#lightboxTitle'),meta:document.querySelector('#lightboxMeta'),counter:document.querySelector('#lightboxCounter'),
    status:document.querySelector('#lightboxStatus'),facts:document.querySelector('#lightboxFacts'),tags:document.querySelector('#lightboxTags'),
    favorite:document.querySelector('#lightboxFavorite'),download:document.querySelector('#downloadImage'),prev:document.querySelector('#previousImage'),next:document.querySelector('#nextImage')
  };
  let activeIndex=-1;
  let returnFocus=null;
  let gesture=null;
  let wheelAt=0;

  function setOrientation(asset){
    const ratio=asset.width>0&&asset.height>0?asset.width/asset.height:1;
    dialog.classList.toggle('is-portrait',ratio<1);
    dialog.classList.toggle('is-landscape',ratio>=1.15);
    dialog.classList.toggle('is-square',ratio>=1&&ratio<1.15);
  }

  function resetGesture(){
    gesture=null;
    stageWrap.classList.remove('is-dragging');
    el.image.style.removeProperty('transform');
    el.image.style.removeProperty('opacity');
  }

  function render(){
    const items=getItems();
    if(!dialog.open||!items.length)return;
    resetGesture();
    activeIndex=Math.max(0,Math.min(activeIndex,items.length-1));
    const asset=items[activeIndex];
    setOrientation(asset);
    el.counter.textContent=`${activeIndex+1} / ${items.length}`;
    el.meta.textContent=formatMeta(asset);
    el.title.textContent=asset.title;
    el.stage.classList.add('is-loading');
    el.image.onload=()=>el.stage.classList.remove('is-loading');
    el.image.onerror=()=>el.stage.classList.remove('is-loading');
    el.image.draggable=false;
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

  stageWrap.addEventListener('pointerdown',event=>{
    if(getItems().length<2)return;
    if(event.target.closest('button,a'))return;
    if(event.pointerType==='mouse'&&event.button!==0)return;
    gesture={id:event.pointerId,startX:event.clientX,startY:event.clientY,lastX:event.clientX,lastY:event.clientY,horizontal:false,cancelled:false};
    stageWrap.setPointerCapture?.(event.pointerId);
  });

  stageWrap.addEventListener('pointermove',event=>{
    if(!gesture||gesture.id!==event.pointerId||gesture.cancelled)return;
    gesture.lastX=event.clientX;
    gesture.lastY=event.clientY;
    const dx=event.clientX-gesture.startX;
    const dy=event.clientY-gesture.startY;
    if(!gesture.horizontal){
      if(Math.abs(dx)<10&&Math.abs(dy)<10)return;
      if(Math.abs(dy)>=Math.abs(dx)){
        gesture.cancelled=true;
        return;
      }
      gesture.horizontal=true;
      stageWrap.classList.add('is-dragging');
    }
    event.preventDefault();
    const offset=Math.max(-110,Math.min(110,dx*.34));
    el.image.style.transform=`translateX(${offset}px)`;
    el.image.style.opacity=String(Math.max(.58,1-Math.abs(offset)/280));
  });

  function finishGesture(event){
    if(!gesture||gesture.id!==event.pointerId)return;
    const dx=(gesture.lastX??event.clientX)-gesture.startX;
    const dy=(gesture.lastY??event.clientY)-gesture.startY;
    const shouldMove=gesture.horizontal&&Math.abs(dx)>64&&Math.abs(dx)>Math.abs(dy)*1.15;
    const direction=dx<0?1:-1;
    resetGesture();
    if(shouldMove)move(direction);
  }

  stageWrap.addEventListener('pointerup',finishGesture);
  stageWrap.addEventListener('pointercancel',resetGesture);

  stageWrap.addEventListener('wheel',event=>{
    if(!dialog.open||getItems().length<2)return;
    if(Math.abs(event.deltaX)<36||Math.abs(event.deltaX)<=Math.abs(event.deltaY))return;
    event.preventDefault();
    const now=Date.now();
    if(now-wheelAt<420)return;
    wheelAt=now;
    move(event.deltaX>0?1:-1);
  },{passive:false});

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
    resetGesture();
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
