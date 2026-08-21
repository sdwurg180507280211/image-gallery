const DISLIKES_KEY='visual-asset-library:dislikes';
const PENDING_KEY='visual-asset-library:dislike-pending-v1';
const MIGRATED_KEY='visual-asset-library:dislike-cloud-migrated-v1';
const API='https://xkuzzmqtboclgvkvdlwd.supabase.co/functions/v1/image-dislikes';

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

function savePending(value){localStorage.setItem(PENDING_KEY,JSON.stringify(value));}

class FeedbackStore{
  constructor(){
    this.dislikes=new Set();
    this.validAssetIds=null;
    this.flushing=false;
    this.initialized=false;
    this.onlineHandler=()=>void this.flushPending();
  }

  filterValid(ids){
    const result=new Set();
    for(const id of ids){
      if(typeof id!=='string')continue;
      if(this.validAssetIds&&!this.validAssetIds.has(id))continue;
      result.add(id);
    }
    return result;
  }

  persist(){localStorage.setItem(DISLIKES_KEY,JSON.stringify([...this.dislikes]));}

  async readRemote(){
    const response=await fetch(API,{cache:'no-store'});
    if(!response.ok)throw new Error(`dislike read failed: HTTP ${response.status}`);
    const payload=await response.json();
    if(payload?.schemaVersion!==1||!Array.isArray(payload.assetIds))throw new Error('invalid dislike payload');
    return this.filterValid(payload.assetIds);
  }

  async pushState(assetId,disliked){
    const response=await fetch(API,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({assetId,disliked})
    });
    if(!response.ok)throw new Error(`dislike sync failed: HTTP ${response.status}`);
  }

  queue(assetId,disliked){
    const pending=readPending();
    pending[assetId]=Boolean(disliked);
    savePending(pending);
    void this.flushPending();
  }

  async flushPending(){
    if(this.flushing)return;
    this.flushing=true;
    try{
      while(true){
        const pending=readPending();
        const entry=Object.entries(pending)[0];
        if(!entry)break;
        const [assetId,disliked]=entry;
        if(this.validAssetIds&&!this.validAssetIds.has(assetId)){
          delete pending[assetId];savePending(pending);continue;
        }
        try{
          await this.pushState(assetId,Boolean(disliked));
          const latest=readPending();
          if(latest[assetId]===disliked){delete latest[assetId];savePending(latest);}
        }catch(error){
          console.warn('[feedback-store] cloud write deferred',error);
          break;
        }
      }
    }finally{this.flushing=false;}
  }

  async init({validAssetIds=[],seedAssetIds=[]}={}){
    this.validAssetIds=new Set(validAssetIds);
    const local=this.filterValid(parseSet(localStorage.getItem(DISLIKES_KEY)));
    const seed=this.filterValid(seedAssetIds);
    const pending=readPending();

    if(localStorage.getItem(MIGRATED_KEY)!=='1'){
      for(const id of local)pending[id]=true;
      savePending(pending);
      localStorage.setItem(MIGRATED_KEY,'1');
    }

    try{
      this.dislikes=await this.readRemote();
    }catch(error){
      console.warn('[feedback-store] cloud read unavailable, using local/seed state',error);
      this.dislikes=local.size?local:seed;
    }

    const latestPending=readPending();
    for(const [id,disliked] of Object.entries(latestPending)){
      if(!this.validAssetIds.has(id))continue;
      disliked?this.dislikes.add(id):this.dislikes.delete(id);
    }

    this.persist();
    this.initialized=true;
    window.removeEventListener('online',this.onlineHandler);
    window.addEventListener('online',this.onlineHandler);
    void this.flushPending();
    return this.getDislikedIds();
  }

  isDisliked(assetId){return this.dislikes.has(assetId);}

  getDislikedIds(){return [...this.dislikes];}

  setDisliked(assetId,disliked){
    if(this.validAssetIds&&!this.validAssetIds.has(assetId))return false;
    const next=Boolean(disliked);
    const current=this.dislikes.has(assetId);
    if(current===next)return next;
    next?this.dislikes.add(assetId):this.dislikes.delete(assetId);
    this.persist();
    this.queue(assetId,next);
    return next;
  }

  toggleDisliked(assetId){return this.setDisliked(assetId,!this.dislikes.has(assetId));}
}

export const feedbackStore=new FeedbackStore();
