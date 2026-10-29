// Run only after 005 is applied. Anonymous access must fail on the live API.
const assert=require('assert');
if(!process.env.SUPABASE_URL)process.loadEnvFile('.env.local');
const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY;
if(!url||!key)throw Error('Set Supabase URL and publishable key');
(async()=>{
 const statuses={};
 for(const [name,body] of [['load_state',{day:'2099-01-01'}],['get_revision',{}],['export_account',{}],['save_state',{day:'2099-01-01',expected:0,body:{},action:'save'}]]){
 const r=await fetch(url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify(body)});statuses[name]=r.status;assert([401,403].includes(r.status),name+' must reject guest, got '+r.status);
 }
 for(const name of ['profiles','cafes','menus','attendees','preferences','orders','order_items','account_state']){
 const r=await fetch(url+'/rest/v1/'+name+'?select=*&limit=1',{headers:{apikey:key}});statuses[name]=r.status;assert([401,403].includes(r.status),name+' must reject guest');
 }
 console.log(JSON.stringify({result:'PASS: live guest access denied',statuses}));
})().catch(err=>{console.error(err.message,err.cause?.code||'');process.exitCode=1});
