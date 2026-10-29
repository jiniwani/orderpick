/* Attendee photo UI and client-side compression. No original image is uploaded. */
(function(root){
'use strict';
const BUCKET='attendee-photos',MAX_BYTES=100*1024,MAX_INPUT=20*1024*1024;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function ownedPath(path,account,person){const p=String(path||'').split('/');return p.length===3&&p[0]===account&&(!person||p[1]===person)&&/^[A-Za-z0-9_-]{1,80}$/.test(p[1])&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/.test(p[2])}
async function compressImage(file){
 if(!file||!file.size)throw Error('사진 파일을 선택해 주세요');
 if(file.size>MAX_INPUT)throw Error('20MB 이하의 사진을 선택해 주세요');
 if(!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type||''))throw Error('JPG·PNG·WebP 사진을 선택해 주세요');
 let bitmap,temporary;
 try{
  if(typeof createImageBitmap==='function')bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
  else bitmap=await new Promise((resolve,reject)=>{temporary=URL.createObjectURL(file);const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('decode'));img.src=temporary});
  const width=bitmap.width||bitmap.naturalWidth,height=bitmap.height||bitmap.naturalHeight;
  if(!width||!height||width*height>80000000)throw Error('dimensions');
  const canvas=document.createElement('canvas'),context=canvas.getContext('2d',{alpha:false});if(!context)throw Error('canvas');
  const scale=Math.min(1,320/Math.max(width,height));
  let outWidth=Math.max(1,Math.round(width*scale)),outHeight=Math.max(1,Math.round(height*scale));
  for(let pass=0;pass<4;pass++){
   canvas.width=outWidth;canvas.height=outHeight;context.fillStyle='#fff';context.fillRect(0,0,outWidth,outHeight);context.drawImage(bitmap,0,0,outWidth,outHeight);
   let candidate;
   for(const quality of [.82,.7,.58,.45]){
    candidate=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
    if(!candidate||candidate.type!=='image/jpeg')throw Error('encoding');
    if(candidate.size<=50*1024)return candidate;
   }
   if(candidate?.size<=MAX_BYTES)return candidate;
   outWidth=Math.max(1,Math.round(outWidth*.75));outHeight=Math.max(1,Math.round(outHeight*.75));
  }
  throw Error('size');
 }catch(error){throw Error('이 사진을 처리하지 못했습니다. JPG·PNG·WebP 사진으로 다시 선택해 주세요. 원본은 업로드하지 않았습니다.')}
 finally{bitmap?.close?.();if(temporary)URL.revokeObjectURL(temporary)}
}
function create(deps){
 const $=id=>document.getElementById(id),context=deps.context;
 let enabled=false,available=false,owner=null,generation=0,records=new Map(),urlCache=new Map(),pendingUrls=null,working=false,dialogPerson=null,dialogMode='view',lastCleanup=0;
 function same(account,epoch){const c=context();return c.account?.id===account&&c.epoch===epoch}
 function note(message){$('photoStatus').textContent=message}
 function canEdit(){const c=context();return !!c.account&&c.ready&&!c.blocked&&!c.busy&&!working&&available}
 function closeDialog(){if($('photoDialog').open)$('photoDialog').close();$('photoDialogImage').removeAttribute('src');$('photoDialogImage').hidden=true;dialogPerson=null;$('photoFile').value=''}
 function reset(){generation++;enabled=false;available=false;owner=null;records.clear();urlCache.clear();pendingUrls=null;lastCleanup=0;closeDialog();$('photoToggle').checked=false;note('로그인 후 사진 표시를 설정할 수 있습니다.');syncLock()}
 function syncLock(){
  $('photoToggle').disabled=!canEdit();$('photoToggle').checked=enabled;
  $('photoUpload').disabled=!canEdit();$('photoRemove').disabled=!canEdit()||!records.has(dialogPerson?.id);
  $('photoClose').disabled=working;$('photoFile').disabled=!canEdit();
  document.querySelectorAll('button[data-photo-person]').forEach(button=>{button.disabled=!context().ready||(button.dataset.photoMode==='manage'&&!canEdit())});
 }
 function avatar(person,mode){
  if(!enabled||!available||!context().account||owner!==context().account.id)return '';
  const has=records.has(person.id),initial=esc(String(person.name||'?').slice(0,1));
  if(mode==='view'&&!has)return `<span class="photo-placeholder" aria-hidden="true">${initial}</span>`;
  return `<button type="button" class="attendee-avatar" data-utility data-photo-person="${esc(person.id)}" data-photo-mode="${mode}" aria-label="${esc(person.name)} 사진 ${mode==='manage'?'관리':'확대'}"><span aria-hidden="true">${initial}</span>${has?'<img alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" hidden>':'<span class="photo-add" aria-hidden="true">+</span>'}</button>`;
 }
 function storage(){return deps.db.storage.from(BUCKET)}
 async function signedUrls(paths){
  const c=context(),account=c.account?.id,epoch=c.epoch,token=generation;if(!enabled||!available||!account)return;
  const missing=[...new Set(paths)].filter(path=>ownedPath(path,account)&&!(urlCache.get(path)?.expires>Date.now()));if(!missing.length)return;
  if(pendingUrls){await pendingUrls;return signedUrls(paths)}
  const request=(async()=>{const response=await storage().createSignedUrls(missing,3600);if(!same(account,epoch)||token!==generation||!enabled)return;if(response.error)throw response.error;
   for(const item of response.data||[]){if(!missing.includes(item.path))continue;let url=null;try{const parsed=new URL(item.signedUrl);if(parsed.origin===new URL(deps.storageOrigin).origin&&/^https?:$/.test(parsed.protocol))url=parsed.href}catch{}
    urlCache.set(item.path,{url,expires:Date.now()+(url?55*60000:60000)});
   }
  })();pendingUrls=request;
  try{await request}catch{if(same(account,epoch)&&token===generation){for(const path of missing)urlCache.set(path,{url:null,expires:Date.now()+60000});note('사진을 불러오지 못했습니다. 이름과 음료 선택은 그대로 사용할 수 있습니다.')}}finally{if(pendingUrls===request)pendingUrls=null}
 }
 async function hydrate(){
  const c=context(),account=c.account?.id,epoch=c.epoch,token=generation;if(!enabled||!available||!account)return;
  const ids=[...document.querySelectorAll('button[data-photo-person]')].map(x=>x.dataset.photoPerson);
  const paths=ids.map(id=>records.get(id)).filter(Boolean);if(dialogPerson&&records.has(dialogPerson.id))paths.push(records.get(dialogPerson.id));
  await signedUrls(paths);if(!same(account,epoch)||token!==generation||!enabled)return;
  document.querySelectorAll('button[data-photo-person] img').forEach(img=>{const id=img.closest('[data-photo-person]').dataset.photoPerson,path=records.get(id),entry=urlCache.get(path);if(!entry?.url)return;if(img.getAttribute('src')!==entry.url)img.src=entry.url;img.hidden=false;img.onerror=()=>{img.hidden=true;img.removeAttribute('src');urlCache.set(path,{url:null,expires:Date.now()+60000})}});
  if(dialogPerson){const entry=urlCache.get(records.get(dialogPerson.id)),image=$('photoDialogImage');if(entry?.url){image.src=entry.url;image.hidden=false;$('photoEmpty').hidden=true}else{image.removeAttribute('src');image.hidden=true;$('photoEmpty').hidden=false}}
 }
 function afterRender(){if(dialogPerson&&!deps.people().some(p=>p.id===dialogPerson.id))closeDialog();syncLock();$('photoBackupHint').hidden=!records.size;void hydrate()}
 async function removeUnreferenced(paths,account,epoch){
  const unique=[...new Set(paths)].filter(path=>ownedPath(path,account)&&![...records.values()].includes(path));if(!unique.length||!same(account,epoch))return;
  const result=await storage().remove(unique);if(result.error&&same(account,epoch))note('사진 설정은 저장됐습니다. 남은 파일은 다음 연결 때 정리합니다.');
 }
 async function cleanup(account,epoch){
  if(Date.now()-lastCleanup<3600000||!same(account,epoch))return;lastCleanup=Date.now();
  try{const r=await deps.db.rpc('list_attendee_photo_orphans');if(r.error||!same(account,epoch))return;await removeUnreferenced(r.data||[],account,epoch)}catch{}
 }
 function apply(state,account){
  const previous=[...records.values()];owner=account;available=true;enabled=state.enabled===true;records=new Map((state.photos||[]).filter(p=>ownedPath(p.path,account,p.attendeeId)).map(p=>[p.attendeeId,p.path]));
  generation++;if(!enabled){urlCache.clear();closeDialog()}else for(const path of urlCache.keys())if(![...records.values()].includes(path))urlCache.delete(path);
  $('photoToggle').checked=enabled;note(enabled?'이름 옆에 작은 사진을 표시합니다. 사진을 누르면 확대하거나 관리할 수 있습니다.':'사진 표시가 꺼져 있습니다. 기존처럼 이름으로 주문할 수 있습니다.');
  deps.render();return previous.filter(path=>![...records.values()].includes(path));
 }
 async function refresh(){
  const c=context(),account=c.account?.id,epoch=c.epoch;if(!account){reset();return}
  try{const response=await deps.db.rpc('load_attendee_photos');if(!same(account,epoch))return;if(response.error)throw response.error;
   if(response.data.revision!==context().revision){available=false;syncLock();note('자료가 변경되었습니다. 다시 불러오면 사진 설정을 반영합니다.');return}
   const old=apply(response.data,account);await removeUnreferenced(old,account,epoch);await cleanup(account,epoch);
  }catch{if(same(account,epoch)){available=false;enabled=false;records.clear();urlCache.clear();generation++;closeDialog();deps.render();note('사진 저장소 준비 전입니다. 기존 주문과 참석자 설정은 그대로 사용할 수 있습니다.')}}
 }
 async function run(action){
  if(!canEdit())return;const before=context(),account=before.account.id,epoch=before.epoch;
  working=true;syncLock();let locked=false;
  try{
   if(before.dirty)await deps.flush();if(!same(account,epoch)||context().dirty||context().blocked)throw Error('현재 주문 변경을 저장한 뒤 다시 시도해 주세요');
   if(context().busy)throw Error('저장이 끝난 뒤 다시 시도해 주세요');deps.busy(true);locked=true;
   const response=await action({account,epoch,expected:context().revision});if(!same(account,epoch))return;if(response.error)throw response.error;
   deps.revision(response.data.revision);const old=apply(response.data,account);if(response.data.oldPath)old.push(response.data.oldPath);
   await removeUnreferenced(old,account,epoch);if(same(account,epoch)){deps.toast('사진 설정을 저장했습니다');$('photoDialogMessage').textContent='사진 설정을 저장했습니다';}
  }catch(error){if(same(account,epoch)){const message=String(error.message||'사진 처리 실패');note(message.includes('VERSION_CONFLICT')?'다른 기기에서 자료를 변경했습니다. 다시 불러온 뒤 시도해 주세요.':message);$('photoDialogMessage').textContent=$('photoStatus').textContent;deps.status($('photoStatus').textContent)}}
  finally{working=false;if(locked&&same(account,epoch))deps.busy(false);syncLock()}
 }
 async function open(person,mode){
  if(!enabled||!available)return;dialogPerson=person;dialogMode=mode;$('photoDialogTitle').textContent=person.name+' 사진';$('photoDialogMessage').textContent='';$('photoDialogActions').hidden=mode!=='manage';$('photoDialogImage').removeAttribute('src');$('photoDialogImage').hidden=true;$('photoDialogImage').alt=person.name+' 사진';$('photoEmpty').hidden=false;$('photoDialog').showModal();syncLock();await hydrate();
 }
 $('photoToggle').onchange=()=>{const value=$('photoToggle').checked;$('photoToggle').checked=enabled;void run(({account,expected})=>deps.db.rpc('set_attendee_photos_enabled',{account,expected,value}))};
 $('photoUpload').onclick=()=>{if(canEdit()&&dialogPerson){$('photoFile').value='';$('photoFile').click()}};
 $('photoFile').onchange=async e=>{const file=e.target.files?.[0],person=dialogPerson;if(!file||!person)return;e.target.value='';
  await run(async({account,epoch,expected})=>{const blob=await compressImage(file);if(!same(account,epoch))throw Error('계정이 바뀌었습니다. 다시 선택해 주세요');const path=account+'/'+person.id+'/'+crypto.randomUUID()+'.jpg';
   const uploaded=await storage().upload(path,blob,{contentType:'image/jpeg',cacheControl:'3600',upsert:false});if(uploaded.error)throw uploaded.error;if(!same(account,epoch))throw Error('계정이 바뀌었습니다. 다시 불러와 주세요');
   // An ambiguous network failure may have committed metadata. Never blindly delete this upload.
   return deps.db.rpc('save_attendee_photo',{account,expected,person:person.id,object_path:path});
  });
 };
 $('photoRemove').onclick=()=>{if(!dialogPerson||!canEdit()||!records.has(dialogPerson.id)||!confirm('이 참석자의 사진을 삭제할까요? 이름과 선호 메뉴는 유지됩니다.'))return;const person=dialogPerson;void run(({account,expected})=>deps.db.rpc('save_attendee_photo',{account,expected,person:person.id,object_path:null}))};
 $('photoClose').onclick=()=>{if(!working)closeDialog()};$('photoDialog').addEventListener('cancel',e=>{if(working)e.preventDefault()});$('photoDialog').addEventListener('close',()=>{$('photoDialogImage').removeAttribute('src');$('photoFile').value='';dialogPerson=null});
 $('photoDialog').onclick=e=>{if(e.target===$('photoDialog')&&!working){const r=$('photoDialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog()}};
 document.addEventListener('click',e=>{const button=e.target.closest('[data-photo-person]');if(!button)return;const person=deps.people().find(x=>x.id===button.dataset.photoPerson);if(person)void open(person,button.dataset.photoMode)});
 reset();return {avatar,afterRender,syncLock,refresh,reset,backup:()=>({enabled,photos:[...records].map(([attendeeId,path])=>({attendeeId,path}))})};
}
root.OrderPickPhotos={create,compressImage,ownedPath,MAX_BYTES};
})(window);
