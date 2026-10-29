const fs=require('fs');const http=require('http'),path=require('path');
const root=process.cwd();
if(fs.existsSync(path.join(root,'.env.local')))process.loadEnvFile(path.join(root,'.env.local'));
http.createServer((req,res)=>{
 const pathname=req.url.split('?')[0];const name=pathname==='/'?'index.html':pathname.slice(1);
 if(!['index.html','app.js','config.js'].includes(name)){res.writeHead(404);return res.end()}
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Type',name.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8');
 if(name==='config.js'&&process.env.SUPABASE_URL&&process.env.SUPABASE_PUBLISHABLE_KEY){return res.end('window.ORDERPICK_CONFIG='+JSON.stringify({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_PUBLISHABLE_KEY})+';')}
 res.end(fs.readFileSync(path.join(root,name)));
}).listen(4173,'127.0.0.1',()=>console.log('OrderPick: http://127.0.0.1:4173'));
