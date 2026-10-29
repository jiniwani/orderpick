# OrderPick 계정별 주문 관리

운영 주소: [https://orderpick.pages.dev](https://orderpick.pages.dev). Cloudflare Pages 무료 정적 호스팅을 사용하며 기존 Vercel 주소는 보존했습니다.

단일 HTML/CSS/JavaScript 앱입니다. **오늘 주문 · 주문서 · 설정** 3개 탭을 사용하며 설정 안에는 참석자·카페·메뉴·데이터 관리 하위 탭이 있으며 선택한 관리 화면만 표시합니다. 상단 로그인 버튼으로 로그인 창을 엽니다. 씨젠 CI의 빨강을 참고한 앱용 색상을 적용했습니다. 공식 로고는 사용하지 않습니다.

005·006 마이그레이션을 승인 후 운영 DB에 적용했습니다. 기존 자료 건수 보존 및 실제 PostgreSQL의 A/B 계정 격리 검사(롤백), 비로그인 HTTP API 거부를 확인했습니다. 프런트엔드 검증 범위와 배포 결과는 TESTING.md에 기록합니다.

## 계정과 데이터

- 로그인한 승인 계정의 카페·메뉴·참석자·선호도·주문·기록만 조회/수정합니다. 같은 계정으로 로그인한 PC와 휴대폰은 같은 자료를 사용합니다.
- 기존 공용 자료는 기존 승인 관리자 한 명의 계정으로 이전합니다. 새 계정은 빈 상태입니다. 관리자도 다른 계정 자료를 볼 수 없습니다.
- 공개 회원가입은 끕니다. 관리자가 Supabase Authentication → Users → Create user에서 Auto Confirm User를 켜고 계정을 직접 발급합니다. 005의 트리거가 승인된 일반 프로필과 계정별 저장 버전을 만듭니다. 비밀번호 입력·전달은 계정 소유자가 안전하게 처리합니다.
- 일반 계정은 주문과 설정을 관리합니다. 전체 초기화는 관리자만 허용하며 **현재 계정 범위**에만 적용됩니다.
- 프런트엔드는 publishable/anon 키만 사용합니다. service_role·sb_secret 키는 빌드에서 거부합니다.

| 테이블 | 관계와 제약 |
| --- | --- |
| profiles | auth.users → 승인 여부·admin/operator, 본인 프로필만 조회 |
| account_state | 프로필별 revision, 계정별 저장 잠금 |
| cafes | account_id → profiles, 계정 안에서 카페 이름 유일 |
| menus | 계정+카페 FK, 카페 안에서 메뉴 이름 유일, 가격 0~10,000,000 |
| attendees | 계정 안에서 이름 유일, 계정+선호 카페 FK |
| preferences | 참석자+카페 기본키, 계정+참석자·카페·메뉴 복합 FK |
| orders | 계정+날짜 유일, 마지막 담당자, draft/completed, 완료 영수증·스냅샷 |
| order_items | 계정+주문·참석자·메뉴 FK, 당시 이름·가격·옵션 보존 |

모든 업무 조회는 계정 조건과 RLS를 적용합니다. 쓰기는 버전·승인·완료 상태를 검사하는 트랜잭션 RPC만 허용합니다. 요청 JSON의 account_id는 소유자 판단에 사용하지 않습니다. 다른 계정 ID 재사용과 외래키 참조도 거부합니다. 카페/참석자/메뉴를 삭제해도 완료 주문의 당시 이름과 가격은 보존합니다.

같은 계정에서 동시에 편집하면 먼저 저장한 요청만 성공하고 다른 쪽은 미저장 내용을 보존한 채 충돌을 알립니다. 백업 후 다시 불러와 필요한 변경을 재입력하세요. 다른 계정의 저장은 충돌을 만들지 않습니다. 날짜는 한국 시간 기준입니다. 완료 주문은 재편집 버튼으로 명시적으로 해제합니다.

## DB 설치·기존 자료 전환

운영 DB 전환 전에는 사용 중인 화면에서 저장 완료를 확인하고 편집을 멈춥니다. 아래 SQL은 한 번만 적용합니다. 기존 적용 파일을 다시 실행하지 마세요.

1. 기존 프로젝트는 001~004 적용 상태를 확인합니다. 새 프로젝트는 해당 파일을 순서대로 실행합니다.
2. 공개 가입을 끄고 이메일/비밀번호 로그인을 활성화합니다. 관리자 계정을 직접 생성하고 다음 SQL의 UUID를 바꿔 승인합니다.

```sql
insert into public.profiles(id,approved,role)
values ('관리자의-실제-UUID',true,'admin')
on conflict(id) do update set approved=true,role='admin';
```

3. `supabase/migrations/005_account_isolation.sql`을 검토하고 승인 후 실행한 다음 `006_account_state_grants.sql`을 적용합니다. 기존 승인 관리자가 정확히 한 명이어야 합니다. 테이블 잠금·비공개 백업·소유자 지정·복합 FK·RLS·RPC 교체·건수 비교를 한 트랜잭션으로 실행합니다. 오류 시 전체 롤백합니다. 기존 행과 ID는 보존합니다.
4. 백업은 API에 노출되지 않는 `orderpick_backup_005` 스키마에 보존됩니다. anon/authenticated는 접근할 수 없습니다. 복구 시 신규 쓰기를 중지하고 DB 관리자가 백업과 현재 데이터를 비교해야 합니다. 역방향 SQL을 무작정 실행하지 마세요.
5. 성공 후 마이그레이션 이력을 기록합니다.

```sql
insert into supabase_migrations.schema_migrations(version,name)
values('005','account_isolation'),('006','account_state_grants') on conflict(version) do nothing;
```

6. 새 프런트엔드를 배포한 뒤 기존 관리자 로그인으로 자료 보존을 확인합니다. 일반 계정도 발급해 별도 브라우저에서 빈 상태·독립 저장을 확인합니다. 새 프런트엔드는 `get_revision`이 없는 이전 백엔드에서 계정 데이터를 읽지 않습니다.
7. 계정 접근 해제는 `update public.profiles set approved=false where id='실제-UUID';`입니다. role 변경도 대시보드에서만 합니다. 기존 세션에도 RPC 승인 검사를 적용합니다.

## 로컬 실행과 검증

```powershell
npm ci
npm test
npm run test:db
node serve.cjs
```

[로컬 화면](http://127.0.0.1:4173/)을 엽니다. `.env.local`에 아래 환경변수를 넣으면 실제 연결을 사용합니다. 파일은 Git에서 제외합니다. HTML을 file://로 열지 마세요.

```text
SUPABASE_URL=https://프로젝트ID.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

`npm test`는 UI 로직·모의 동기화·계정 화면 비우기·가져오기·빌드를 검사합니다. `npm run test:db`는 메모리 안의 PGlite PostgreSQL에서 001~006과 A/B 격리·RLS·조작 방지·주문 시나리오를 실행합니다. 운영 DB에 연결하지 않으며 테스트 자료는 롤백합니다. PGlite는 개발 테스트 의존성이고 배포되는 브라우저 앱에 포함되지 않습니다. 실제 Supabase Auth/PostgREST와 두 기기 검증은 별도로 필요합니다.

## 무료 사용량과 배포

30초마다 버전 숫자만 확인하며 화면이 숨겨져 있으면 중지합니다. 변경된 경우에만 전체 상태를 다시 읽습니다. 앱 복귀 때도 확인합니다. 기록 조회는 최근 30건이고 완료 스냅샷은 당시 설정을 보존합니다. 배너는 정적 호스팅 자산입니다. 참석자 사진 기능의 저장 방식과 적용 상태는 아래를 참조하세요.

무료 한도는 모든 계정 합계입니다. Supabase Free의 DB 500MB·월 전송 5GB·월 활성 사용자 50,000명 범위를 확인해야 합니다. 비활성 프로젝트는 일시중지될 수 있습니다. 무기한·무제한 무료를 보장하지 않습니다. 설정 → 데이터 백업은 현재 작업 내용과 계정의 **전체 서버 기록 archive**를 포함합니다. 자동 삭제·과금 전환은 구현하지 않습니다. 직접 가입·메일 비밀번호 재설정은 별도 SMTP가 필요할 수 있으며 현재는 관리자 발급 방식입니다.

Cloudflare Pages에 jiniwani/orderpick의 main을 연결해 자동 배포를 설정했습니다. 정적 보안 헤더는 `_headers`로 적용합니다. Production/Preview에 Supabase URL·publishable key를 등록했고 새 도메인의 HTTP 200·보안 헤더·이미지·공개 설정을 확인했습니다. Supabase Auth Site URL은 https://orderpick.pages.dev 입니다. 새 주소에서는 다시 로그인해야 하며 같은 계정의 기존 자료를 불러옵니다. 아래는 배포 재현 절차입니다.

1. Cloudflare Pages에 GitHub 저장소를 연결합니다. Build command `npm run build`, output directory `public`, 프로젝트 루트 사용, Framework는 None입니다.
2. 위 환경변수를 Production과 사용할 Preview 환경에 등록합니다.
3. 배포 후 새 주소에서 로그인·저장·모바일 UI를 확인하고 Supabase Auth Site URL에 실제 사용할 주소를 등록합니다.
4. 확인이 끝난 뒤 기존 주소에서의 전환을 결정합니다. 현재 Vercel 프로젝트를 자동 삭제하지 않습니다.

Vercel도 `vercel.json`으로 같은 build/output과 환경변수를 사용합니다. Hobby는 개인·비상업용 제한이 있으므로 여러 사업장 업무 운영에 사용할 때는 정적 호스팅 이전이나 적절한 요금제를 선택해야 합니다. 공개키는 config.js에 보이며 인증과 RLS가 데이터를 보호합니다.

공식 안내: [Supabase 요금](https://supabase.com/pricing), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Cloudflare Pages 요금](https://developers.cloudflare.com/pages/functions/pricing/), [씨젠의료재단 CI](https://pr.seegenemedical.com/foundation/ci/index.do).

## 기존 localStorage 가져오기

원본 키는 `orderpick_v1`입니다. 원본 HTML의 브라우저 저장소에서 `export-legacy.js`로 JSON을 내보내고, 새 앱에 로그인한 뒤 설정 → 데이터 관리 → 기존 JSON 가져오기를 선택합니다. 이전 직전 작업 내용도 백업합니다. 원본 localStorage는 자동 삭제하지 않습니다.

카페/메뉴/참석자 이름으로 중복을 피하고 선호도 ID를 다시 매핑합니다. 같은 메뉴의 가격이 다르면 중단합니다. 기존 선호도는 덮어쓰지 않습니다. 날짜가 없는 옛 임시 주문과 문자열 기록은 새 서버 주문으로 변환하지 않고 원본 백업에 보존합니다. 서버 전체 archive는 보관용이며 JSON 가져오기에서 과거 주문을 복구하는 기능은 아닙니다.

원본은 `original.html`로 보존하며 Downloads 파일은 수정하지 않았습니다. 배너 자산·생성 프롬프트는 `assets/README.md`, 설계는 `docs/multi-user-design.md`, 검증 결과와 미검증 범위는 `TESTING.md`를 참조하세요.

## 아이디 로그인과 본인 비밀번호 변경

`orderpick01`처럼 발급한 아이디는 앱 내부에서 `아이디@users.orderpick.invalid`로 변환해 Supabase Auth에 로그인합니다. `.invalid`는 내부 식별용이며 실제 이메일이나 메일 발송을 사용하지 않습니다. 기존 관리자 이메일 로그인도 계속 지원합니다. 공개 회원가입은 비활성 상태를 유지합니다.

아이디 계정을 발급할 때는 Supabase Create user의 Email address에 위 내부 주소를 넣고 Auto confirm user를 켭니다. 초기 비밀번호는 계정 관리자가 브라우저에서 직접 입력하고 제출합니다. 새 계정의 프로필은 기존 트리거로 approved=true/operator, 독립된 빈 저장소로 생성됩니다. 메일을 받을 수 없는 아이디 계정이 비밀번호를 잊으면 관리자가 재설정해야 합니다.

로그인 후 상단 내 계정(관리자는 관리자) → 비밀번호 변경에서 현재 비밀번호·새 비밀번호·새 비밀번호 확인을 입력합니다. 새 비밀번호는 8~128자이며 기존 비밀번호와 달라야 합니다. 현재 비밀번호를 Auth로 재확인하고 같은 계정임을 확인한 뒤 `auth.updateUser({password})`로 본인 비밀번호만 변경합니다. 비밀번호는 DB 업무 테이블, localStorage, 로그에 별도로 기록하지 않으며 완료·실패·창 닫기·계정 전환 때 입력을 비웁니다. Auth의 기본 로그인 세션 저장은 기존과 동일합니다.

## 참석자 사진

설정에서 사진 표시를 켜고 끌 수 있습니다. 브라우저 자동 압축, 비공개 계정별 저장, 작은 사진과 확대·교체·삭제를 구현했습니다. 007 운영 SQL은 2026-10-29 비공개 백업 후 적용했습니다. 프런트엔드는 main 커밋으로 자동 배포합니다. 적용 방법과 제한은 [사진 기능 설명](docs/attendee-photos.md)을 참조하세요.

로그인 화면에서는 아이디만 입력합니다: admin, orderpick01, orderpick02. admin은 기존 관리자 계정에 연결되며 비밀번호와 자료는 유지됩니다. 브라우저가 이전 내부 이메일 주소를 자동 입력하면 앱이 짧은 아이디로 정리합니다. 참석자 카드에서는 선호 카페를 고르지 않고 선호 메뉴만 설정하며, 카페가 여러 개일 때는 상단 관리 카페 선택을 사용합니다.
