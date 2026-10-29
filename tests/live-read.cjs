const assert=require('assert');
if(!process.env.SUPABASE_URL)process.loadEnvFile('.env.local');
const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY;
if(!url||!key)throw Error('Set Supabase URL and publishable key');
const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
(async()=>{
 const response=await fetch(url+'/rest/v1/rpc/load_state',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({day})});
 const state=await response.json();assert(response.ok,JSON.stringify(state));assert(Array.isArray(state.data.cafes));assert(Array.isArray(state.data.people));
 const profiles=await fetch(url+'/rest/v1/profiles?select=id',{headers:{apikey:key}});assert([401,403].includes(profiles.status),'Guest profile read must be denied');
 console.log(JSON.stringify({result:'PASS',day,revision:state.revision,status:state.status,cafes:state.data.cafes.length,attendees:state.data.people.length,guestProfileStatus:profiles.status}));
})().catch(err=>{console.error(err.message,err.cause?.code||'');process.exitCode=1});

