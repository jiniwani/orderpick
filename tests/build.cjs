const fs=require('fs'),os=require('os'),path=require('path'),cp=require('child_process'),assert=require('assert');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'orderpick-build-'));
try {
 for(const n of ['index.html','app.js','_headers'])fs.copyFileSync(n,path.join(folder,n));
 fs.mkdirSync(path.join(folder,'assets'));fs.copyFileSync('assets/coffee-banner-red.jpg',path.join(folder,'assets/coffee-banner-red.jpg'));
 const run=key=>cp.spawnSync(process.execPath,[path.resolve('build.cjs')],{cwd:folder,env:{...process.env,SUPABASE_URL:'https://build-test.supabase.co',SUPABASE_PUBLISHABLE_KEY:key},encoding:'utf8'});
 assert.equal(run('sb_publishable_test_only').status,0);
 assert.deepEqual(fs.readdirSync(path.join(folder,'public')).sort(),['_headers','app.js','assets','config.js','index.html']);
 assert.deepEqual(fs.readdirSync(path.join(folder,'public/assets')),['coffee-banner-red.jpg']);
 assert(fs.readFileSync(path.join(folder,'public/assets/coffee-banner-red.jpg')).equals(fs.readFileSync('assets/coffee-banner-red.jpg')));
 assert.notEqual(run('sb_secret_test_only').status,0);
 const jwt='e30.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.fake';assert.notEqual(run(jwt).status,0);
 const preview=cp.spawnSync(process.execPath,[path.resolve('build.cjs')],{cwd:folder,env:{...process.env,SUPABASE_URL:'',SUPABASE_PUBLISHABLE_KEY:'',VITE_SUPABASE_URL:'',VITE_SUPABASE_PUBLISHABLE_KEY:''},encoding:'utf8'});
 assert.equal(preview.status,0);assert(fs.readFileSync(path.join(folder,'public/config.js'),'utf8').includes('={};'));
 console.log('PASS: 배너 이미지 포함 배포 파일, 원본·설명 파일 배포 제외, secret/service_role 키 거부, 미연결 미리보기 빌드');
} finally {
 for(const n of ['_headers','app.js','config.js','index.html']){const p=path.join(folder,'public',n);if(fs.existsSync(p))fs.unlinkSync(p)}
 for(const parent of ['public/assets','assets']){const p=path.join(folder,parent);if(fs.existsSync(path.join(p,'coffee-banner-red.jpg')))fs.unlinkSync(path.join(p,'coffee-banner-red.jpg'));if(fs.existsSync(p))fs.rmdirSync(p)}
 if(fs.existsSync(path.join(folder,'public')))fs.rmdirSync(path.join(folder,'public'));
 for(const n of ['_headers','app.js','index.html'])fs.unlinkSync(path.join(folder,n));fs.rmdirSync(folder);
}
