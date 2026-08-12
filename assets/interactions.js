const interactiveSelector='button,a,input,select,textarea,[tabindex]:not([tabindex="-1"])';

function blurCurrentControl(){
  const active=document.activeElement;
  if(active instanceof HTMLElement&&active!==document.body&&active.matches(interactiveSelector)) active.blur();
}

document.addEventListener('pointerdown',event=>{
  if(event.target instanceof Element&&event.target.closest(interactiveSelector)) return;
  blurCurrentControl();
},{capture:true});

document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!document.querySelector('#lightbox')?.open){
    const active=document.activeElement;
    if(active instanceof HTMLInputElement&&active.type==='search'){
      active.blur();
      return;
    }
    blurCurrentControl();
  }
});
