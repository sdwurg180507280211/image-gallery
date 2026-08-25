export function createLightbox({getItems,formatMeta,isFavorite,onToggleFavorite,isDisliked,onToggleDislike}){
  const dialog=document.querySelector('#lightbox');
  const el={
    stage:document.querySelector('#lightboxStage'),
    image:document.querySelector('#lightboxImage'),
    close:document.querySelector('#lightboxClose'),
    counter:document.querySelector('#lightboxCounter'),
    meta:document.querySelector('#lightboxMeta'),
    title:document.querySelector('#lightboxTitle'),
    favorite:document.querySelector('#lightboxFavorite'),
    dislike:document.querySelector('#lightboxDislike'),
    prompt:document.querySelector('#lightboxPrompt'),
    download:document.querySelector('#downloadImage'),
    prev:document.querySelector('#previousImage'),
    next:document.querySelector('#nextImage'),
    promptPanel:document.querySelector('#promptPanel'),
    promptClose:document.querySelector('#promptPanelClose'),
    promptKind:document.querySelector('#promptKindLabel'),
    promptTitle:document.querySelector('#promptPanelTitle'),
    promptText:document.querySelector('#promptText'),
    copyPrompt:document.querySelector('#copyPrompt')
  };

  let activeIndex=-1;
  let activeAsset=null;
  let returnFocus=null;
  let keyboardMode=false;
  let pan=null;
  let controlsTimer=null;
  let offset={x:0,y:0};
  let bounds={minX:0,maxX:0,minY:0,maxY:0};
  const promptCache=new Map();

  el.stage.tabIndex=-1;

  const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
  function gcd(a,b){
    a=Math.abs(Math.round(a));b=Math.abs(Math.round(b));
    while(b){const next=a%b;a=b;b=next;}
    return a||1;
  }
  function aspectRatio(asset){
    const width=Number(asset?.width)||0,height=Number(asset?.height)||0;
    if(!(width>0&&height>0))return '';
    const divisor=gcd(width,height);
    return `${Math.round(width/divisor)}:${Math.round(height/divisor)}`;
  }

  function promptOpen(){return !el.promptPanel.hidden;}

  function controlFocused(){
    const active=document.activeElement;
    return keyboardMode&&active instanceof HTMLElement&&dialog.contains(active)&&active.matches('button,a');
  }

  function scheduleControlsHide(delay=1500){
    clearTimeout(controlsTimer);
    if(promptOpen())return;
    controlsTimer=setTimeout(()=>{
      if(dialog.open&&!pan&&!promptOpen()&&!controlFocused()) dialog.classList.add('controls-hidden');
    },delay);
  }

  function showControls(){
    if(!dialog.open)return;
    dialog.classList.remove('controls-hidden');
    if(!controlFocused()&&!promptOpen()) scheduleControlsHide();
  }

  function clearTransientFocus(){
    const active=document.activeElement;
    if(active instanceof HTMLElement&&dialog.contains(active)&&active!==el.stage) active.blur();
  }

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

  function extractPrompt(markdown){
    const match=markdown.match(/## 生成提示词\s*\n([\s\S]*?)(?=\n##\s|$)/);
    return (match?.[1]||markdown).trim();
  }

  function closePromptPanel(){
    el.promptPanel.hidden=true;
    el.promptText.textContent='';
    el.copyPrompt.textContent='复制提示词';
    showControls();
  }

  async function openPromptPanel(){
    if(!activeAsset?.promptPath)return;
    clearTimeout(controlsTimer);
    dialog.classList.remove('controls-hidden');
    el.promptPanel.hidden=false;
    el.promptKind.textContent=activeAsset.promptKind==='original'?'原始提示词':'重建提示词';
    el.promptTitle.textContent=activeAsset.title;
    el.promptText.textContent='正在读取提示词…';
    el.copyPrompt.disabled=true;
    try{
      let text=promptCache.get(activeAsset.promptPath);
      if(!text){
        const response=await fetch(encodeURI(activeAsset.promptPath),{cache:'no-store'});
        if(!response.ok)throw new Error(`HTTP ${response.status}`);
        text=extractPrompt(await response.text());
        promptCache.set(activeAsset.promptPath,text);
      }
      if(!activeAsset||el.promptPanel.hidden)return;
      el.promptText.textContent=text;
      el.copyPrompt.disabled=false;
    }catch(error){
      el.promptText.textContent=`提示词读取失败：${error.message}`;
    }
  }

  function render(){
    const items=getItems();
    if(!dialog.open||!items.length)return;
    closePromptPanel();
    activeIndex=Math.max(0,Math.min(activeIndex,items.length-1));
    activeAsset=items[activeIndex];
    pan=null;
    el.stage.classList.remove('is-panning');

    const ratio=aspectRatio(activeAsset);
    el.counter.textContent=`${activeIndex+1} / ${items.length}`;
    el.meta.textContent=`${formatMeta(activeAsset)} · ${activeAsset.width} × ${activeAsset.height}${ratio?` · ${ratio}`:''}`;
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
    const disliked=isDisliked?.(activeAsset.id)===true;
    el.dislike.textContent=disliked?'👎 已标记':'👎 不喜欢';
    el.dislike.setAttribute('aria-pressed',String(disliked));
    el.dislike.title=disliked?'取消不喜欢标记':'标记不喜欢，之后可集中删除';
    el.prompt.hidden=!activeAsset.promptPath;
    el.prev.disabled=items.length<2;
    el.next.disabled=items.length<2;
    showControls();
  }

  function open(index,opener){
    const items=getItems();
    if(!items.length)return;
    activeIndex=Math.max(0,Math.min(index,items.length-1));
    returnFocus=keyboardMode?(opener||document.activeElement):null;
    dialog.showModal();
    document.body.style.overflow='hidden';
    if(!keyboardMode) el.stage.focus({preventScroll:true});
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

  document.addEventListener('pointerdown',()=>{keyboardMode=false;},{capture:true});
  document.addEventListener('keydown',event=>{
    if(['Tab','Enter',' '].includes(event.key)) keyboardMode=true;
    if(!dialog.open)return;
    showControls();
    if(event.key==='Escape'&&promptOpen()){
      event.preventDefault();
      closePromptPanel();
    }else if(event.key==='ArrowLeft'&&!promptOpen()){
      event.preventDefault();
      move(-1);
    }else if(event.key==='ArrowRight'&&!promptOpen()){
      event.preventDefault();
      move(1);
    }else if(event.key==='Escape'){
      event.preventDefault();
      close();
    }
  });

  dialog.addEventListener('pointermove',()=>{
    if(!keyboardMode&&!promptOpen()) showControls();
  });

  el.stage.addEventListener('pointerdown',event=>{
    keyboardMode=false;
    clearTransientFocus();
    showControls();
    if(!el.stage.classList.contains('is-pannable')){
      scheduleControlsHide(450);
      return;
    }
    if(event.pointerType==='mouse'&&event.button!==0)return;
    pan={id:event.pointerId,x:event.clientX,y:event.clientY,startX:offset.x,startY:offset.y,moved:false};
    el.stage.setPointerCapture?.(event.pointerId);
    el.stage.classList.add('is-panning');
    event.preventDefault();
  });

  el.stage.addEventListener('pointermove',event=>{
    if(!pan||pan.id!==event.pointerId)return;
    const dx=event.clientX-pan.x;
    const dy=event.clientY-pan.y;
    if(Math.abs(dx)>3||Math.abs(dy)>3) pan.moved=true;
    offset.x=pan.startX+dx;
    offset.y=pan.startY+dy;
    applyOffset();
    event.preventDefault();
  });

  function finishPan(event){
    if(!pan||pan.id!==event.pointerId)return;
    const moved=pan.moved;
    pan=null;
    el.stage.classList.remove('is-panning');
    scheduleControlsHide(moved?1100:350);
  }
  el.stage.addEventListener('pointerup',finishPan);
  el.stage.addEventListener('pointercancel',()=>{
    pan=null;
    el.stage.classList.remove('is-panning');
    scheduleControlsHide(900);
  });

  el.stage.addEventListener('wheel',event=>{
    if(!activeAsset||!el.stage.classList.contains('is-pannable'))return;
    keyboardMode=false;
    clearTransientFocus();
    offset.x-=event.deltaX;
    offset.y-=event.deltaY;
    applyOffset();
    scheduleControlsHide(900);
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
  el.dislike.onclick=()=>{
    if(!activeAsset)return;
    onToggleDislike?.(activeAsset.id,el.dislike);
  };
  el.prompt.onclick=openPromptPanel;
  el.promptClose.onclick=closePromptPanel;
  el.promptPanel.onclick=event=>{if(event.target===el.promptPanel)closePromptPanel();};
  el.copyPrompt.onclick=async()=>{
    const text=el.promptText.textContent.trim();
    if(!text||el.copyPrompt.disabled)return;
    await navigator.clipboard.writeText(text);
    el.copyPrompt.textContent='已复制';
    setTimeout(()=>{if(!el.promptPanel.hidden)el.copyPrompt.textContent='复制提示词';},1200);
  };

  dialog.addEventListener('close',()=>{
    clearTimeout(controlsTimer);
    document.body.style.overflow='';
    closePromptPanel();
    activeAsset=null;
    pan=null;
    dialog.classList.remove('controls-hidden');
    el.stage.classList.remove('is-panning','is-pannable','is-loading');
    el.image.removeAttribute('src');
    el.image.style.removeProperty('transform');
    const target=returnFocus;
    returnFocus=null;
    if(target?.isConnected) target.focus({preventScroll:true});
  });

  window.addEventListener('resize',()=>{
    if(dialog.open&&activeAsset) resetViewport(activeAsset);
  });

  return {open,refresh:render,isOpen:()=>dialog.open};
}
