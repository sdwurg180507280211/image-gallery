export function createLightbox({getItems,formatMeta,isFavorite,onToggleFavorite}){
  const dialog=document.querySelector('#lightbox');
  const el={
    stage:document.querySelector('#lightboxStage'),
    image:document.querySelector('#lightboxImage'),
    close:document.querySelector('#lightboxClose'),
    counter:document.querySelector('#lightboxCounter'),
    meta:document.querySelector('#lightboxMeta'),
    title:document.querySelector('#lightboxTitle'),
    status:document.querySelector('#lightboxStatus'),
    favorite:document.querySelector('#lightboxFavorite'),
    download:document.querySelector('#downloadImage'),
    prev:document.querySelector('#previousImage'),
    next:document.querySelector('#nextImage')
  };

  let activeIndex=-1;
  let returnFocus=null;
  let activeAsset=null;
  let pan=null;
  let offset={x:0,y:0};
  let bounds={minX:0,maxX:0,minY:0,maxY:0};

  const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));

  function computeBounds(asset){
    const width=el.stage.clientWidth;
    const height=el.stage.clientHeight;
    const centerX=(width-asset.width)/2;
    const centerY=(height-asset.height)/2;
    bounds={
      minX:asset.width>width?width-asset.width:centerX,
      maxX:asset.width>width?0:centerX,
      minY:asset.height>height?height-asset.height:centerY,
      maxY:asset.height>height?0:centerY
    };
    el.stage.classList.toggle('is-pannable',asset.width>width||asset.height>height);
  }

  function applyOffset(){
    offset.x=clamp(offset.x,bounds.minX,bounds.maxX);
    offset.y=clamp(offset.y,bounds.minY,bounds.maxY);
    el.image.style.transform=`translate3d(${offset.x}px,${offset.y}px,0)`;
  }

  function resetViewport(asset){
    computeBounds(asset);
    const width=el.stage.clientWidth;
    const height=el.stage.clientHeight;
    offset.x=(width-asset.width)/2;
    offset.y=asset.height>height?0:(height-asset.height)/2;
    applyOffset();
  }

  function render(){
    const items=getItems();
    if(!dialog.open||!items.length)return;
    activeIndex=Math.max(0,Math.min(activeIndex,items.length-1));
    activeAsset=items[activeIndex];
    pan=null;
    el.stage.classList.remove('is-panning');

    el.counter.textContent=`${activeIndex+1} / ${items.length}`;
    el.meta.textContent=`${formatMeta(activeAsset)} · ${activeAsset.width} × ${activeAsset.height} · 1:1`;
    el.title.textContent=activeAsset.title;
    el.image.style.width=`${activeAsset.width}px`;
    el.image.style.height=`${activeAsset.height}px`;
    el.image.alt=activeAsset.title;
    el.stage.classList.add('is-loading');
    el.image.onload=()=>{
      el.stage.classList.remove('is-loading');
      resetViewport(activeAsset);
    };
    el.image.onerror=()=>el.stage.classList.remove('is-loading');
    el.image.src=encodeURI(activeAsset.path);

    el.download.href=encodeURI(activeAsset.path);
    el.download.download=activeAsset.path.split('/').pop();
    const favorite=isFavorite(activeAsset.id);
    el.favorite.textContent=favorite?'♥ 已收藏':'♡ 收藏';
    el.favorite.setAttribute('aria-pressed',String(favorite));
    el.prev.disabled=items.length<2;
    el.next.disabled=items.length<2;

    if(activeAsset.domain==='medical-kv'){
      el.status.hidden=false;
      el.status.className=`viewer-status ${activeAsset.used?'used':'unused'}`;
      el.status.textContent=activeAsset.used?'✓ 已使用':'● 未使用';
    }else{
      el.status.hidden=true;
    }
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
    if(!el.stage.classList.contains('is-pannable'))return;
    if(event.pointerType==='mouse'&&event.button!==0)return;
    pan={id:event.pointerId,x:event.clientX,y:event.clientY,startX:offset.x,startY:offset.y};
    el.stage.setPointerCapture?.(event.pointerId);
    el.stage.classList.add('is-panning');
    event.preventDefault();
  });

  el.stage.addEventListener('pointermove',event=>{
    if(!pan||pan.id!==event.pointerId)return;
    offset.x=pan.startX+(event.clientX-pan.x);
    offset.y=pan.startY+(event.clientY-pan.y);
    applyOffset();
    event.preventDefault();
  });

  function finishPan(event){
    if(pan&&pan.id===event.pointerId){
      pan=null;
      el.stage.classList.remove('is-panning');
    }
  }
  el.stage.addEventListener('pointerup',finishPan);
  el.stage.addEventListener('pointercancel',()=>{
    pan=null;
    el.stage.classList.remove('is-panning');
  });

  el.stage.addEventListener('wheel',event=>{
    if(!activeAsset||!el.stage.classList.contains('is-pannable'))return;
    offset.x-=event.deltaX;
    offset.y-=event.deltaY;
    applyOffset();
    event.preventDefault();
  },{passive:false});

  el.close.onclick=close;
  el.prev.onclick=()=>move(-1);
  el.next.onclick=()=>move(1);
  el.favorite.onclick=()=>{
    if(!activeAsset)return;
    onToggleFavorite(activeAsset.id);
    render();
  };

  dialog.addEventListener('close',()=>{
    document.body.style.overflow='';
    activeAsset=null;
    pan=null;
    el.stage.classList.remove('is-panning','is-pannable','is-loading');
    el.image.removeAttribute('src');
    el.image.style.removeProperty('transform');
    const target=returnFocus;
    returnFocus=null;
    if(target?.isConnected)target.focus({preventScroll:true});
  });

  window.addEventListener('resize',()=>{
    if(dialog.open&&activeAsset)resetViewport(activeAsset);
  });

  document.addEventListener('keydown',event=>{
    if(!dialog.open)return;
    if(event.key==='ArrowLeft'){
      event.preventDefault();
      move(-1);
    }else if(event.key==='ArrowRight'){
      event.preventDefault();
      move(1);
    }else if(event.key==='Escape'){
      event.preventDefault();
      close();
    }
  });

  return {open,refresh:render,isOpen:()=>dialog.open};
}
