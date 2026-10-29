const fs=require('fs'),vm=require('vm'),assert=require('assert');const els=new Map();function el(id){if(!els.has(id))els.set(id,{id,showModal(){this.open=true},close(){this.open=false},value:'',textContent:'',innerHTML:'',dataset:{},classList:{toggle(){},add(){},remove(){}},addEventListener(){},matches(){return false}});return els.get(id)}const sandbox={console,structuredClone,Intl,Date,JSON,Math,Number,String,Map,Set,crypto:require('crypto').webcrypto,confirm:()=>true,prompt:()=>null,setTimeout:()=>1,clearTimeout(){},setInterval(){},localStorage:{getItem(){return null}},document:{getElementById:el,querySelectorAll:()=>[],addEventListener(){},activeElement:null},window:{ORDERPICK_CONFIG:{},addEventListener(){}},navigator:{},Blob,URL};vm.createContext(sandbox);let code=fs.readFileSync('app.js','utf8').replace(/^import .*;\r?\n/,'');vm.runInContext(code+`
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
