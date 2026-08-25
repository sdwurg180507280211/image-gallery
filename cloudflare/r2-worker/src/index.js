export default {
  async fetch(request, env) {
    const url=new URL(request.url);
    if(url.pathname==='/health'){
      return Response.json({ok:true,service:'image-gallery-commerce',r2Bound:Boolean(env.ORIGINALS)});
    }
    return new Response('Not Found',{status:404});
  }
};
