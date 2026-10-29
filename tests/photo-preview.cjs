// Isolated localhost-only demo. No environment variables or production services.
const fs=require('fs'),http=require('http');
const account='00000000-0000-4000-8000-0000000000a7';
let revision=0,enabled=false,photos=[],files=new Map(),downloads=0;
let data={cafes:[{id:'local_cafe',name:'로컬 검증 카페',menu:[{id:'local_menu',name:'아메리카노',price:3000},{id:'local_latte',name:'라테',price:4000}]}],people:[{id:'local_person',name:'사진 검증 참석자',preferredCafeId:'local_cafe',favorites:{}}],cafeId:'local_cafe',orders:{},history:[]};
const state=()=>({revision,status:'draft',data});const photoState=()=>({revision,enabled,photos});
http.createServer(async(req,res)=>{try{
const path=new URL(req.url,'http://localhost').pathname;
res.setHeader('Cache-Control','no-store');
if(path==='/mock.js'){res.setHeader('Content-Type','text/javascript');return res.end(`const call=async(name,args)=>{const r=await fetch('/rpc',{method:'POST',body:JSON.stringify({name,args})});return r.json()};export function createClient(){return {auth:{onAuthStateChange(){},getSession:async()=>({data:{session:{user:{id:'${account}',email:'local@example.invalid'}}}})},from:()=>({select:()=>({single:async()=>({data:{approved:true,role:'operator'}})})}),rpc:call,storage:{from:()=>({createSignedUrls:async paths=>({data:paths.map(path=>({path,signedUrl:location.origin+'/photo/'+path}))}),upload:async(path,blob)=>{const r=await fetch('/photo/'+path,{method:'PUT',body:blob});return r.json()},remove:async paths=>{await fetch('/remove',{method:'POST',body:JSON.stringify(paths)});return {data:[]}}})}}}`)}
if(path==='/rpc'){let raw='';for await(const chunk of req)raw+=chunk;const {name,args:a={}}=JSON.parse(raw);let result;
if(name==='get_revision')result=revision;else if(name==='load_state')result=state();else if(name==='load_attendee_photos')result=photoState();else if(name==='list_attendee_photo_orphans')result=[];
else {if(a.expected!==revision)return res.end(JSON.stringify({error:{message:'VERSION_CONFLICT'}}));if(name==='save_state'){data=a.body;revision++;result=state()}else if(name==='set_attendee_photos_enabled'){enabled=a.value;revision++;result=photoState()}else if(name==='save_attendee_photo'){const oldPath=photos.find(x=>x.attendeeId===a.person)?.path;photos=photos.filter(x=>x.attendeeId!==a.person);if(a.object_path)photos.push({attendeeId:a.person,path:a.object_path});revision++;result={...photoState(),oldPath}}}
res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({data:result}))}
if(path.startsWith('/photo/')){const key=path.slice(7);if(req.method==='PUT'){const chunks=[];for await(const c of req)chunks.push(c);files.set(key,Buffer.concat(chunks));return res.end('{}')}downloads++;res.setHeader('Content-Type','image/jpeg');return res.end(files.get(key)||Buffer.alloc(0))}
if(path==='/remove'){let raw='';for await(const c of req)raw+=c;for(const key of JSON.parse(raw))files.delete(key);return res.end('{}')}
if(path==='/metrics'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({revision,enabled,photos,files:[...files.values()].map(b=>b.length),downloads}))}
const name=path==='/'?'index.html':path.slice(1);if(!['index.html','app.js','photos.js','config.js','assets/coffee-banner-red.jpg'].includes(name)){res.statusCode=404;return res.end()}
res.setHeader('Content-Type',name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.jpg')?'image/jpeg':'text/javascript; charset=utf-8');
if(name==='config.js')return res.end('window.ORDERPICK_CONFIG={url:location.origin,key:"local-mock-only"}');
let content=fs.readFileSync(name);if(name==='app.js')content=content.toString().replace(/^import .*;\r?\n/,"import {createClient} from '/mock.js';\n");res.end(content);
}catch(e){res.statusCode=500;res.end(e.message)}}).listen(4174,'127.0.0.1',()=>console.log('Isolated photo preview: http://127.0.0.1:4174 (local fixtures only)'));
