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
vm.runInContext(`
if(parsePrice('미정')!==null||parsePrice('')!==null||parsePrice(null)!==null||parsePrice('0')!==0||parsePrice('3,500')!==3500)throw Error('가격 입력 처리');
for(const input of ['-1','abc','Infinity','10000001'])if(!Number.isNaN(parsePrice(input)))throw Error('잘못된 가격 허용');
data.cafes=[{id:'unknown_c',name:'기본',menu:[{id:'known_m',name:'확정 음료',price:1000}]}];data.cafeId='unknown_c';data.people=[{id:'unknown_p',name:'A',favorites:{}},{id:'known_p',name:'B',favorites:{}}];data.orders={};
$('newDrink').value='미정 음료';$('newPrice').value='미정';$('addDrink').onclick();var unknownId=cafe().menu[1].id;
if(cafe().menu[1].price!==null)throw Error('미정 등록 실패');ensure(data.people[0]).on=true;ensure(data.people[0]).menuId=unknownId;ensure(data.people[1]).on=true;render();
if($('heroPrice').textContent!=='미정'||$('summaryTotal').textContent!=='미정'||!$('summaryPriceNote').textContent.includes('1,000원')||$('summaryPriceNote').hidden)throw Error('미정 합계 표시');
if(!textOrder().includes('총 예상금액 미정')||!textOrder().includes('가격 미정 1잔')||!textOrder().includes('(가격 미정)'))throw Error('복사 주문서 미정 누락');
if(JSON.parse(JSON.stringify(data)).cafes[0].menu[1].price!==null)throw Error('백업 미정 보존');
if(!receiptAmount({total:null,knownTotal:1000,unknownCount:1}).includes('미정'))throw Error('기록 표시');
cafe().menu[1].price=0;render();if($('heroPrice').textContent!=='1,000원'||!$('summaryPriceNote').hidden||money(0)!=='0원')throw Error('0원과 미정 혼동');
`,sandbox);console.log('PASS: 미정/0원 구분, 미정 메뉴 등록, 혼합 주문 합계·복사·기록 표시, 가격 유효성, JSON 보존');
vm.runInContext(`
data.cafes=[{id:'dining_c',name:'카페',menu:[{id:'dining_m',name:'같은 음료',price:3000}]}];data.cafeId='dining_c';data.people=[{id:'dining_a',name:'A',favorites:{}},{id:'dining_b',name:'B',favorites:{}}];data.orders={};
data.people.forEach(p=>ensure(p).on=true);ensure(data.people[0]).diningMode='dine_in';ensure(data.people[1]).diningMode='takeout';render();
if(grouped().length!==2||selected().length!==2||$('heroPrice').textContent!=='6,000원')throw Error('이용 방법별 집계');
if(!textOrder().includes('매장 이용')||!textOrder().includes('테이크아웃')||!$('summaryLines').innerHTML.includes('테이크아웃')||!$('personSummary').innerHTML.includes('매장 이용'))throw Error('주문서 이용 방법 누락');
if(!$('orderPeople').innerHTML.includes('data-field="diningMode"'))throw Error('이용 방법 선택창');
var savedDining=JSON.parse(JSON.stringify(data));if(savedDining.orders['dining_c:dining_b'].diningMode!=='takeout')throw Error('저장/백업 이용 방법 유실');
ensure(data.people[1]).diningMode='dine_in';if(grouped().length!==1||grouped()[0].qty!==2)throw Error('동일 이용 방법 합산');
delete ensure(data.people[0]).diningMode;delete ensure(data.people[1]).diningMode;render();if(textOrder().includes('매장 이용')||textOrder().includes('테이크아웃'))throw Error('이전 주문 이용 방법 추정');
$('resetToday').onclick();if(data.people.length!==2||data.cafes.length!==1||selected().length)throw Error('오늘 초기화 설정 보존');
`,sandbox);
const diningChange=value=>{for(const fn of preferenceEvents.change||[])fn({target:{dataset:{person:'dining_a',field:'diningMode'},value,closest:()=>null},preventDefault(){},stopImmediatePropagation(){}})};
diningChange('takeout');assert.equal(vm.runInContext("ensure(data.people[0]).diningMode",sandbox),'takeout');diningChange('invalid');assert.equal(vm.runInContext("ensure(data.people[0]).diningMode",sandbox),'takeout');
console.log('PASS: 이용 방법 선택·변경, 같은 음료 분리/합산, 합계 유지, 주문서·개인별 내역·JSON 보존, 이전 주문 미선택, 잘못된 값 거부');
vm.runInContext(`
data.cafes=[{id:'inline_c',name:'카페',menu:[{id:'inline_m',name:'원래 메뉴',price:3000},{id:'inline_other',name:'다른 메뉴',price:2000}]}];data.cafeId='inline_c';data.people=[];data.orders={};ready=true;completed=false;blocked=false;render();
beginMenuEdit(cafe().menu[0]);
if(!$('menuList').innerHTML.includes('data-menu-form="inline_m"'))throw Error('카드 내 편집 전환');
for(const [field,value] of [['name','수정 메뉴'],['price','미정']])$('menuList').oninput({target:{dataset:{menuId:'inline_m',menuField:field},value}});
if(cafe().menu[0].price!==3000||cafe().menu[0].name!=='원래 메뉴')throw Error('저장 전 원본 변경');render();
if(!$('menuList').innerHTML.includes('value="수정 메뉴"'))throw Error('재렌더링 중 입력 유실');
$('menuList').onsubmit({preventDefault(){},target:{dataset:{menuForm:'inline_m'}}});
if(cafe().menu[0].name!=='수정 메뉴'||cafe().menu[0].price!==null||menuEdits.size)throw Error('이름·미정 가격 저장');
beginMenuEdit(cafe().menu[0]);menuEdits.get('inline_m').price='4,500';saveMenuEdit('inline_m');if(cafe().menu[0].price!==4500)throw Error('숫자 가격 저장');
beginMenuEdit(cafe().menu[0]);menuEdits.get('inline_m').name='취소 이름';menuEdits.get('inline_m').price='0';cancelMenuEdit('inline_m');if(cafe().menu[0].name!=='수정 메뉴'||cafe().menu[0].price!==4500)throw Error('취소 원본 보존');
beginMenuEdit(cafe().menu[0]);menuEdits.get('inline_m').price='-1';saveMenuEdit('inline_m');if(!menuEdits.get('inline_m').error||cafe().menu[0].price!==4500)throw Error('잘못된 가격 거부');
menuEdits.get('inline_m').price='0';menuEdits.get('inline_m').name='다른 메뉴';saveMenuEdit('inline_m');if(!menuEdits.get('inline_m').error||cafe().menu[0].price!==4500)throw Error('중복 이름 거부');
menuEdits.get('inline_m').name='수정 메뉴';saveMenuEdit('inline_m');if(cafe().menu[0].price!==0)throw Error('0원 저장');
beginMenuEdit(cafe().menu[0]);menuEdits.get('inline_m').price='999';cafe().menu[0].price=500;saveMenuEdit('inline_m');if(cafe().menu[0].price!==500||!menuEdits.get('inline_m').error.includes('다른 기기'))throw Error('동시 수정 보호');cancelMenuEdit('inline_m');
completed=true;beginMenuEdit(cafe().menu[0]);if(menuEdits.size)throw Error('완료 보호');completed=false;beginMenuEdit(cafe().menu[0]);clearAccount();if(menuEdits.size)throw Error('계정 전환 편집 내용 제거');
`,sandbox);console.log('PASS: 메뉴 카드 직접 편집, 숫자·미정·0원 저장, 취소·입력 유지, 가격·중복·동시 수정·완료·계정 전환 보호');
