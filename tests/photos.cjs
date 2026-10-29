const fs=require('fs'),vm=require('vm'),assert=require('assert');
const elements=new Map(),calls=[],canvas={width:0,height:0,getContext:()=>({fillRect(){},drawImage(){}}),toBlob(cb,type){cb(new Blob(['compressed'],{type}))}};
function el(id){if(!elements.has(id))elements.set(id,{checked:false,hidden:false,disabled:false,textContent:'',value:'',open:false,dataset:{},removeAttribute(){},addEventListener(){},close(){this.open=false},showModal(){this.open=true}});return elements.get(id)}
let image={width:4000,height:3000,close(){}},response,fail=false;
const account='00000000-0000-4000-8000-0000000000a7',path=account+'/person/00000000-0000-4000-8000-000000000001.jpg';
const context={account:{id:account},epoch:1,revision:0,ready:true,busy:false,dirty:false,blocked:false};
let state={revision:0,enabled:false,photos:[{attendeeId:'person',path}]};
const sandbox={window:{},Blob,URL,Map,Set,Date,console,crypto:require('crypto').webcrypto,confirm:()=>true,createImageBitmap:async()=>image,document:{getElementById:el,querySelectorAll:()=>[],addEventListener(){},createElement:()=>canvas}};
vm.createContext(sandbox);vm.runInContext(fs.readFileSync('photos.js','utf8'),sandbox);
const api=sandbox.window.OrderPickPhotos;
const deps={context:()=>context,people:()=>[{id:'person',name:'검증'}],storageOrigin:'https://test.supabase.co',render(){},status(){},toast(){},flush:async()=>{context.dirty=false},busy:b=>context.busy=b,revision:r=>context.revision=r,db:{rpc:async(name,args)=>{calls.push({name,args});if(response)return response;if(fail)return {error:{message:'VERSION_CONFLICT'}};return {data:name==='list_attendee_photo_orphans'?[]:state}},storage:{from:()=>({createSignedUrls:async()=>{calls.push({name:'signed'});return {data:[]}},remove:async()=>{calls.push({name:'remove'});return {}},upload:async()=>{calls.push({name:'upload'});return {}}})}}};
(async()=>{
let blob=await api.compressImage({size:1000000,type:'image/jpeg'});assert.equal(blob.type,'image/jpeg');assert(blob.size<=api.MAX_BYTES);assert.equal(canvas.width,320);assert.equal(canvas.height,240);
image={width:80,height:40,close(){}};await api.compressImage({size:100,type:'image/png'});assert.equal(canvas.width,80,'No upscaling');
for(const file of [{size:1,type:'image/svg+xml'},{size:21*1024*1024,type:'image/jpeg'},{size:0,type:'image/jpeg'}])await assert.rejects(api.compressImage(file));
canvas.toBlob=cb=>cb(new Blob([new Uint8Array(110000)],{type:'image/jpeg'}));await assert.rejects(api.compressImage({size:100,type:'image/jpeg'}));assert(canvas.width<80,'Oversize output is resized, never original fallback');
assert(api.ownedPath(path,account,'person'));assert(!api.ownedPath(path,'other','person'));assert(!api.ownedPath(path,account,'other'));assert(!api.ownedPath(account+'/person/../x.jpg',account));
const ui=api.create(deps);await ui.refresh();ui.afterRender();assert.equal(ui.avatar({id:'person',name:'검증'},'view'),'');assert(!calls.some(x=>x.name==='signed'),'OFF does not request URLs');
state={...state,enabled:true};await ui.refresh();assert(ui.avatar({id:'person',name:'<검증>'},'manage').includes('&lt;검증&gt;'));assert(ui.avatar({id:'person',name:'검증'},'view').includes('사진 확대'));
fail=true;el('photoToggle').checked=false;el('photoToggle').onchange();await new Promise(r=>setImmediate(r));assert.equal(context.revision,0);assert(el('photoStatus').textContent.includes('다른 기기'));assert(!calls.some(x=>x.name==='remove'),'Failure must not delete files');fail=false;
let resolve;response=new Promise(r=>resolve=r);const pending=ui.refresh();context.account={id:'another'};context.epoch++;ui.reset();resolve({data:state});await pending;assert.equal(ui.avatar({id:'person',name:'검증'},'view'),'','Late account response ignored');
assert.equal(ui.backup().photos.length,0);console.log('PASS: photo compression/aspect/no-upscale/limits, unsafe formats, private paths, OFF no download, escaped labels, conflicts, no blind cleanup, account race');
})().catch(e=>{console.error(e);process.exitCode=1});
