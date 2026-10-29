const preferenceEvents={};
const fs=require('fs'),vm=require('vm'),assert=require('assert');const els=new Map();function el(id){if(!els.has(id))els.set(id,{id,showModal(){this.open=true},close(){this.open=false},value:'',textContent:'',innerHTML:'',dataset:{},classList:{toggle(){},add(){},remove(){}},addEventListener(){},matches(){return false}});return els.get(id)}const sandbox={console,structuredClone,Intl,Date,JSON,Math,Number,String,Map,Set,crypto:require('crypto').webcrypto,confirm:()=>true,prompt:()=>null,setTimeout:()=>1,clearTimeout(){},setInterval(){},localStorage:{getItem(){return null}},document:{getElementById:el,querySelectorAll:()=>[],addEventListener(name,fn){(preferenceEvents[name]||=[]).push(fn)},activeElement:null},window:{ORDERPICK_CONFIG:{},addEventListener(){}},navigator:{},Blob,URL};vm.createContext(sandbox);let code=fs.readFileSync('app.js','utf8').replace(/^import .*;\r?\n/,'');vm.runInContext(code+`
$('adminLogin').onclick();if(!$('loginDialog').open)throw Error('로그인 창 열기');$('password').value='temporary';$('closeLogin').onclick();if($('loginDialog').open||$('password').value)throw Error('로그인 창 닫기');if(!$('resetAll').hidden)throw Error('관리자 초기화 숨김');
if(data.cafes.length||data.people.length)throw Error('임의 데이터 생성');
$('newPerson').value='검증용 참석자';$('addPerson').onclick();render();
$('allOn').onclick();
$('newCafe').value='검증용 카페';$('addCafe').onclick();
$('newDrink').value='검증용 음료';$('newPrice').value='4500';$('addDrink').onclick();
$('allOn').onclick();
if(selected().length!==1||grouped()[0].price!==4500)throw Error('주문 집계');
ensure(data.people[0]).strength='연하게';if(!textOrder().includes('연하게'))throw Error('농도 복사');
data.people[0].favorites[favKey(data.people[0])]=cafe().menu[0].id;
$('resetToday').onclick();
if(selected().length||data.cafes.length!==1||data.people.length!==1||!Object.keys(data.people[0].favorites).length)throw Error('오늘 초기화 설정 보존');
`,sandbox);console.log('PASS: 빈 데이터 렌더링, 참석자 선등록, 카페/메뉴 추가, 참석 선택, 가격 집계, 농도 복사, 오늘 초기화 설정 보존');const sql=fs.readFileSync('supabase/migrations/001_orderpick.sql','utf8');for(const marker of ['order_date date not null unique','for update','VERSION_CONFLICT','ADMIN_REQUIRED','ORDER_COMPLETED','enable row level security','snapshot=body'])assert(sql.includes(marker),marker);console.log('PASS: SQL 필수 보호 구문 존재 (실제 PostgreSQL 실행 검증은 별도)');

const html=fs.readFileSync('index.html','utf8');assert(!html.includes('id="account"'));assert(html.includes('<dialog id="loginDialog"'));assert(!/<dialog[^>]*\sopen[\s>]/.test(html));const guest=fs.readFileSync('supabase/migrations/002_guest_access_admin_login.sql','utf8');assert(guest.includes('to anon'));assert(guest.includes('ADMIN_REQUIRED'));assert(!guest.includes('values(day,auth.uid(),'));console.log('PASS: 로그인 창 열기/닫기, 비밀번호 비우기, 초기화 숨김, 공용 접근 마이그레이션 정적 검사');

const safeDeleteSql=fs.readFileSync('supabase/migrations/004_safe_delete_predicates.sql','utf8');assert(!/delete\s+from\s+\w+\s*;/i.test(safeDeleteSql),'Every delete must have a WHERE predicate');assert(safeDeleteSql.includes('ADMIN_REQUIRED'));assert(safeDeleteSql.includes('VERSION_CONFLICT'));console.log('PASS: 모든 삭제문에 WHERE 조건, 관리자·버전 보호 유지');

assert.deepEqual([...html.matchAll(/data-tab="([^"]+)"/g)].map(m=>m[1]),['order','summary','settings']);assert(!html.includes('class="panel" id="people"'));assert(!html.includes('class="panel" id="cafes"'));assert(html.includes('id="settings"'));console.log('PASS: 오늘 주문·주문서·설정 3탭, 설정 안 참석자·카페·메뉴');
vm.runInContext(`
for(const id of ['orderpick01','orderpick02']){if(loginAddress(id)!==id+'@users.orderpick.invalid')throw Error('짧은 아이디 인증 연결');$('email').value=id+'@users.orderpick.invalid';$('email').oninput();if($('email').value!==id)throw Error('자동 입력 주소 정리');}
if(loginAddress('ADMIN')!=='gwef121@gmail.com'||displayLoginId('gwef121@gmail.com')!=='admin')throw Error('관리자 아이디 연결');
$('email').value='gwef121@gmail.com';$('email').onchange();if($('email').value!=='admin')throw Error('관리자 표시 정리');
if(loginAddress('legacy@example.com')!=='legacy@example.com')throw Error('기존 계정 호환');
`,sandbox);console.log('PASS: orderpick01/02 아이디 로그인, admin 기존 계정 연결, 자동입력 이메일을 짧은 아이디로 표시');

vm.runInContext(`
data.cafes=[{id:'a',name:'A',menu:[{id:'ma',name:'A drink',price:1000}]},{id:'b',name:'B',menu:[{id:'mb',name:'B drink',price:2000}]}];
data.people=[{id:'p',name:'Person',preferredCafeId:'a',favorites:{'a:p':'ma'}}];data.cafeId='a';data.orders={};preferenceCafeId='';render();
if($('peopleList').innerHTML.includes('preferredCafeId')||$('peopleList').innerHTML.includes('선호 카페'))throw Error('참석자별 카페 필드 잔류');
if(!$('peopleList').innerHTML.includes('value="ma" selected'))throw Error('기존 선호 메뉴 표시');
var originalPreferenceData=JSON.stringify(data);$('preferenceCafe').onchange({target:{value:'b'}});
if(JSON.stringify(data)!==originalPreferenceData||data.cafeId!=='a')throw Error('관리 카페 변경이 주문 데이터를 바꿈');
`,sandbox);
const personChange=value=>{const event={target:{dataset:{person:'p',field:'preferredFavorite'},value,closest:()=>null},preventDefault(){},stopImmediatePropagation(){}};for(const fn of preferenceEvents.change||[])fn(event)};
personChange('mb');
vm.runInContext(`if(data.people[0].favorites['a:p']!=='ma'||data.people[0].favorites['b:p']!=='mb'||data.people[0].preferredCafeId!=='a'||ensure(data.people[0]).menuId!=='ma')throw Error('카페별 선호도 또는 오늘 주문 손상');`,sandbox);
personChange('ma');vm.runInContext(`if(data.people[0].favorites['b:p']!=='mb')throw Error('다른 카페 메뉴 허용');data.cafes=data.cafes.filter(c=>c.id!=='b');render();if(!$('preferenceCafeCard').hidden||preferenceCafeId!=='a')throw Error('단일 카페 설정 간소화');`,sandbox);
console.log('PASS: 참석자별 선호 카페 제거, 기존 메뉴 표시, 관리 카페와 오늘 주문 독립, 카페별 선호도 보존, 잘못된 메뉴 거부, 단일 카페 선택 생략');
