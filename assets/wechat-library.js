let COMPONENTS=[];
let active='全部';
let query='';
const assetView=document.querySelector('#assetLibraryView');
const wechatView=document.querySelector('#wechatLibraryView');
const chips=document.querySelector('#wechatChips');
const grid=document.querySelector('#wechatGrid');
const search=document.querySelector('#wechatSearch');
const empty=document.querySelector('#wechatEmpty');
const wechatTab=document.querySelector('.domain-tab[data-domain="wechat"]');
const heroEyebrow=document.querySelector('.hero .eyebrow');
const heroTitle=document.querySelector('.hero h1');
const heroIntro=document.querySelector('.hero p:not(.eyebrow)');
const defaultHero={
  eyebrow:heroEyebrow?.textContent||'',
  title:heroTitle?.innerHTML||'',
  intro:heroIntro?.textContent||''
};

function renderChips(){
  const cats=['全部',...new Set(COMPONENTS.map(x=>x.category))];
  chips.replaceChildren();
  cats.forEach(cat=>{
    const b=document.createElement('button');
    b.type='button';
    b.className='wechat-chip'+(cat===active?' active':'');
    b.textContent=cat;
    b.onclick=()=>{active=cat;renderChips();render();};
    chips.append(b);
  });
}
function render(){
  const q=query.trim().toLowerCase();
  const items=COMPONENTS.filter(x=>(active==='全部'||x.category===active)&&(!q||(x.id+' '+x.name).toLowerCase().includes(q)));
  grid.replaceChildren();
  empty.hidden=items.length>0;
  items.forEach(item=>{
    const card=document.createElement('article');card.className='wechat-card';
    const head=document.createElement('div');head.className='wechat-card-head';
    const copyWrap=document.createElement('div');
    copyWrap.innerHTML='<div class="wechat-card-id"></div><div class="wechat-card-name"></div>';
    copyWrap.querySelector('.wechat-card-id').textContent=item.id;
    copyWrap.querySelector('.wechat-card-name').textContent=item.name;
    const btn=document.createElement('button');btn.type='button';btn.className='wechat-copy';btn.textContent='复制 HTML';
    btn.onclick=async()=>{
      try{await navigator.clipboard.writeText(item.html)}catch{const ta=document.createElement('textarea');ta.value=item.html;document.body.append(ta);ta.select();document.execCommand('copy');ta.remove();}
      btn.textContent='已复制';btn.classList.add('done');setTimeout(()=>{btn.textContent='复制 HTML';btn.classList.remove('done');},1200);
    };
    head.append(copyWrap,btn);
    const shell=document.createElement('div');shell.className='wechat-preview-shell';
    const preview=document.createElement('div');preview.className='wechat-preview';preview.innerHTML=item.html;
    shell.append(preview);card.append(head,shell);grid.append(card);
  });
}
function setWechatHero(){
  if(heroEyebrow)heroEyebrow.textContent='WECHAT STYLE LIBRARY';
  if(heroTitle)heroTitle.innerHTML='把好用的公众号样式，<span>真正沉淀下来。</span>';
  if(heroIntro)heroIntro.textContent='按组件分类浏览并选择样式，记住编号即可。后续直接指定编号，我会按选定的顶部关注、导语、标题、正文、Figure、参考文献与结尾样式组合生成公众号文章。';
}
function restoreHero(){
  if(heroEyebrow)heroEyebrow.textContent=defaultHero.eyebrow;
  if(heroTitle)heroTitle.innerHTML=defaultHero.title;
  if(heroIntro)heroIntro.textContent=defaultHero.intro;
}
function showWechat(){
  document.body.classList.add('wechat-mode');
  setWechatHero();
  assetView.hidden=true;
  wechatView.hidden=false;
  history.replaceState(null,'',location.pathname+location.search+'#wechat');
}
function showAssets(){
  document.body.classList.remove('wechat-mode');
  restoreHero();
  wechatView.hidden=true;
  assetView.hidden=false;
  if(location.hash==='#wechat')history.replaceState(null,'',location.pathname+location.search);
}
async function loadComponents(){
  const response=await fetch('./wechat/index.html',{cache:'no-store'});
  if(!response.ok)throw new Error(`公众号样式读取失败：HTTP ${response.status}`);
  const source=await response.text();
  const match=source.match(/const COMPONENTS=(\[.*?\]);const cats=/s);
  if(!match)throw new Error('公众号样式数据格式无法识别。');
  COMPONENTS=JSON.parse(match[1]);
  const count=wechatTab?.querySelector('small');if(count)count.textContent=String(COMPONENTS.length);
  renderChips();render();
}

document.querySelectorAll('.domain-tab').forEach(button=>{
  if(button.dataset.domain==='wechat')button.addEventListener('click',showWechat);
  else button.addEventListener('click',showAssets);
});
search.addEventListener('input',e=>{query=e.target.value;render();});
loadComponents().catch(error=>{console.error(error);empty.hidden=false;empty.textContent=error.message;});
if(location.hash==='#wechat')setTimeout(()=>wechatTab?.click(),0);
