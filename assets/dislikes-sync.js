const DISLIKES_KEY='visual-asset-library:dislikes';
const PENDING_KEY='visual-asset-library:dislike-pending-v1';
const MIGRATED_KEY='visual-asset-library:dislike-cloud-migrated-v1';
const API='https://xkuzzmqtboclgvkvdlwd.supabase.co/functions/v1/image-dislikes';

const nativeSetItem=Storage.prototype.setItem;
let flushing=false;

function parseSet(value){
  try{
    const parsed=JSON.parse(value||'[]');
    return new Set(Array.isArray(parsed)?parsed.filter(id=>typeof id==='string'):[]);
  }catch{return new Set();}
}
function readPending(){
  try{
    const value=JSON.parse(localStorage.getItem(PENDING_KEY)||'{}');
    return value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  }catch{return {};}
}
function savePending(value){nativeSetItem.call(localStorage,PENDING_KEY,JSON.stringify(value));}
function saveDislikes(set){nativeSetItem.call(localStorage,DISLIKES_KEY,JSON.stringify([...set]));}

async function pushState(assetId,disliked){
  const response=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({assetId,disliked})});
  if(!response.ok)throw new Error(`dislike sync failed: HTTP ${response.status}`);
}

async function flushPending(){
  if(flushing)return;
  flushing=true;
  try{
    while(true){
      const pending=readPending();
      const entry=Object.entries(pending)[0];
      if(!entry)break;
      const [assetId,disliked]=entry;
      try{
        await pushState(assetId,Boolean(disliked));
        const latest=readPending();
        if(latest[assetId]===disliked){delete latest[assetId];savePending(latest);}
      }catch(error){console.warn('[dislikes-sync] cloud write deferred',error);break;}
    }
  }finally{flushing=false;}
}

function queueDiff(before,after){
  const pending=readPending();
  for(const id of after)if(!before.has(id))pending[id]=true;
  for(const id of before)if(!after.has(id))pending[id]=false;
  savePending(pending);
  void flushPending();
}

Storage.prototype.setItem=function(key,value){
  if(this===localStorage&&key===DISLIKES_KEY){
    const before=parseSet(localStorage.getItem(DISLIKES_KEY));
    nativeSetItem.call(this,key,value);
    const after=parseSet(value);
    queueDiff(before,after);
    return;
  }
  nativeSetItem.call(this,key,value);
};

async function readRemote(){
  const response=await fetch(API,{cache:'no-store'});
  if(!response.ok)throw new Error(`dislike read failed: HTTP ${response.status}`);
  const payload=await response.json();
  if(payload?.schemaVersion!==1||!Array.isArray(payload.assetIds))throw new Error('invalid dislike payload');
  return new Set(payload.assetIds.filter(id=>typeof id==='string'));
}

async function reconcile(){
  const local=parseSet(localStorage.getItem(DISLIKES_KEY));
  const pending=readPending();

  if(localStorage.getItem(MIGRATED_KEY)!=='1'){
    for(const id of local)pending[id]=true;
    savePending(pending);
    nativeSetItem.call(localStorage,MIGRATED_KEY,'1');
  }

  let effective=new Set(local);
  try{
    effective=await readRemote();
  }catch(error){
    console.warn('[dislikes-sync] cloud read unavailable, using local state',error);
  }

  const latestPending=readPending();
  for(const [id,disliked] of Object.entries(latestPending)){
    disliked?effective.add(id):effective.delete(id);
  }

  saveDislikes(effective);
  void flushPending();
}

await reconcile();
await import('./app.js?v=12');
