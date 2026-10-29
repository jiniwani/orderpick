# OrderPick 공용 주문 관리

기존 화면과 4개 탭을 유지한 HTML/CSS/JavaScript 앱입니다. 일반 주문은 로그인 없이 사용하며, 상단 관리자 로그인 버튼을 누르면 별도 창이 열립니다. 관리자 로그인은 전체 데이터 초기화에만 필요합니다. 프레임워크와 서버 비밀키를 사용하지 않습니다. `original.html`은 전달받은 원본 사본이며 Downloads 원본은 수정하지 않았습니다.

## 파일

- `index.html`: 기존 디자인, 로그인·백업·가져오기·재편집 화면
- `app.js`: 기존 주문 기능 + Supabase 인증·자동 저장·동기화
- `config.js`: 로컬 미설정 안내용. 배포 시 환경변수로 새로 생성
- `build.cjs`, `vercel.json`: 공개 파일만 public에 빌드하고 Vercel에 배포
- `supabase/migrations/001_orderpick.sql`: 테이블, 제약, RLS, 저장·조회 RPC
- `export-legacy.js`: 원본 페이지의 localStorage 백업 도구
- `tests/`, `TESTING.md`: 로컬 자동 검증과 실제 운영 연결 후 검증 절차

## 데이터베이스 구조

| 테이블 | 내용 및 주요 관계 |
| --- | --- |
| cafes | 카페. 이름 유일 |
| menus | cafe_id → cafes, 카페 안에서 메뉴 이름 유일, 가격 0 이상 |
| attendees | 참석자 이름 유일, preferred_cafe_id → cafes |
| preferences | 참석자+카페 복합 기본키, 메뉴+카페 복합 FK로 다른 카페 메뉴 지정 차단 |
| orders | 날짜 유일, owner_id → profiles, draft/completed, 편집 중 데이터, 완료 영수증·화면 스냅샷 |
| order_items | orders → 주문, 참석자·메뉴 FK와 당시 이름·가격·옵션 스냅샷 |
| profiles | auth.users UUID, 관리자 approved=true, role=admin |
| app_state | 추가된 단일 행. 공용 저장 버전과 트랜잭션 잠금 |

카페 삭제 시 해당 메뉴·선호도를 함께 삭제하고 선호 카페 FK는 NULL로 바꿉니다. 참석자 삭제 시 선호도를 함께 삭제합니다. 과거 주문 항목은 참석자·메뉴 FK만 NULL로 바꾸고 당시 이름·가격을 보존합니다. 주문 삭제 시 항목도 삭제됩니다. 당일 초기화는 draft만 비우며 공용 설정과 과거 기록을 보존합니다.

공용 데이터 전체를 하나의 저장 단위로 처리합니다. `save_state`는 app_state 행을 잠근 뒤 expected 버전이 맞을 때만 설정·주문을 함께 저장합니다. 동시 변경은 한쪽만 성공하고 다른 쪽에는 충돌을 표시합니다. 자동 병합은 하지 않습니다. 미저장 내용을 백업하고 다시 불러온 후 필요한 변경을 재입력합니다. 담당자(owner_id)는 마지막 저장한 승인 계정이며, 비로그인 저장은 NULL입니다. 날짜는 한국 시간 기준입니다.

완료 시 주문 항목과 화면 스냅샷을 보관하므로 나중에 메뉴 가격이나 참석자를 바꿔도 완료 주문의 금액·복사 내용이 바뀌지 않습니다. 재편집은 명시적 버튼으로 잠금을 해제하며, 다시 완료하면 해당 날짜의 완료 기록을 갱신합니다. 날짜별 완료 기록 하나를 유지하는 구조이며 세부 수정 이력 버전 관리는 포함하지 않습니다.

## Supabase 설정

1. 새 전용 Supabase 프로젝트를 생성합니다. SQL Editor에서 `supabase/migrations/001_orderpick.sql`, `supabase/migrations/002_guest_access_admin_login.sql`, `supabase/migrations/003_fix_save_alias.sql`, `supabase/migrations/004_safe_delete_predicates.sql` 순서로 실행합니다. 이미 적용한 파일은 건너뛰고 새 마이그레이션만 실행합니다. 기존 다른 서비스 DB에 적용하지 마세요. 중복 실행용 마이그레이션은 아닙니다.
2. Authentication 설정에서 공개 신규 가입(Allow new users to sign up)을 끄고 이메일/비밀번호 로그인을 사용합니다. 프런트엔드에는 가입 기능이 없습니다.
3. Authentication → Users에서 관리자 계정만 생성합니다. 일반 사용자 계정은 만들 필요가 없습니다. 초기 비밀번호는 안전한 경로로 당사자에게 전달합니다. 이 앱에는 비밀번호 설정·재설정 화면이 없으므로 계정 관리는 Supabase 대시보드에서 수행합니다.
4. 사용자 UUID를 확인하고 SQL Editor에서 승인합니다. 아래 UUID를 실제 사용자 UUID로 바꿉니다.

```sql
insert into public.profiles (id, approved, role)
values ('관리자의-실제-UUID', true, 'admin')
on conflict (id) do update set approved = excluded.approved, role = excluded.role;
-- 관리자 계정만 등록합니다.
-- 접근 해제: update public.profiles set approved=false where id='실제-UUID';
```

프로필 생성·관리자 지정은 대시보드에서만 가능합니다. 일반 사용자는 계정 없이 같은 공용 데이터를 사용합니다. 주소나 공개 API 설정을 알면 카페·메뉴·참석자·선호도·주문을 읽고 수정할 수 있는 구성입니다. 사용자 요청에 따른 공개 접근 방식이며, 관리자 로그인은 전체 초기화만 제한합니다. 팀별 분리 기능은 없습니다.

모든 테이블에 RLS를 적용했습니다. 업무 테이블은 비로그인 anon 역할도 SELECT할 수 있습니다. 직접 REST 쓰기 정책은 없으며, 쓰기는 완료 상태·저장 버전과 초기화 관리자 권한을 검사하는 SECURITY DEFINER RPC로 처리합니다. profiles는 로그인한 본인만 읽을 수 있고 자기 권한 변경은 불가능합니다. 002는 일반 접근 허용을 위해 is_approved를 항상 true로 바꾸며, is_admin은 승인된 관리자 여부를 계속 검사합니다.

## 환경변수와 Vercel 배포

Vercel 프로젝트의 Framework Preset은 Other, Build Command는 `npm run build`, Output Directory는 `public`입니다. 프로젝트 루트는 이 폴더입니다. 별도 npm 의존성 설치가 필요 없습니다.

다음 두 환경변수를 Production과 사용할 Preview 환경에 설정하고 배포합니다.

```text
SUPABASE_URL=https://프로젝트ID.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

URL과 publishable key는 빌드한 config.js에 포함되며 브라우저에서 보입니다. 기존 anon JWT 키도 role=anon일 때만 허용합니다. service_role, sb_secret 키는 사용하지 않으며 빌드에서도 거부합니다. 데이터 보호는 공개키 은닉이 아닌 Auth·RLS·RPC 권한 검사로 처리합니다. 비밀키는 Vercel에도 이 앱용으로 등록할 필요가 없습니다. 비로그인 접근 정책에 따라 업무 데이터는 공개 접근이 허용되고, 전체 초기화만 Auth와 관리자 권한으로 보호합니다.

Vercel에서 이 폴더를 Git 저장소로 연결하거나 Vercel CLI로 프로젝트를 배포합니다. 환경변수 변경 후에는 재배포해야 합니다. Supabase Authentication URL 설정에는 실제 배포 도메인을 등록합니다. 2026-10-29 OrderPick 전용 Supabase 프로젝트에 001~004을 적용하고 Vercel Production 환경변수를 등록했습니다. 관리자는 사용자가 만든 계정을 승인한 방식으로 설정합니다.

로컬 연결 시험(PowerShell):

```powershell
$env:SUPABASE_URL='https://실제프로젝트.supabase.co'
$env:SUPABASE_PUBLISHABLE_KEY='sb_publishable_실제공개키'
node build.cjs
```

생성된 public 폴더를 HTTP 정적 서버로 제공합니다. `node serve.cjs`는 기본적으로 루트 폴더를 제공하며 환경 미설정 화면 검증용입니다. 실제 연결 시험에서는 `public` 폴더로 이동한 뒤 `node ..\serve.cjs`로 실행합니다. 주소는 http://127.0.0.1:4173 입니다. HTML을 file://로 직접 열어 실행하지 않습니다.

## 기존 데이터 이전

원본 키는 `orderpick_v1`입니다. 카페 배열 안에 menu 배열, people 배열 안에 preferredCafeId와 `카페ID:참석자ID` 형태 favorites가 들어 있습니다. orders는 날짜가 없는 임시 주문 객체이고 history는 문자열 주문서 목록입니다.

1. 원본을 사용했던 브라우저에서 원본 HTML을 엽니다. 복사본은 저장소 주소가 달라 기존 데이터가 보이지 않을 수 있습니다.
2. 개발자 도구 Console에서 `export-legacy.js` 내용을 실행해 JSON을 다운로드합니다. 원본 저장소는 수정하거나 삭제하지 않습니다.
3. 새 앱의 참석자 탭 → 데이터 관리 → 기존 JSON 가져오기를 선택합니다. 같은 주소에 원본 저장소가 있는 경우 기존 데이터 백업 버튼으로도 백업할 수 있습니다.
4. 가져오기 직전 공용 설정 백업도 다운로드합니다. 백업을 보관한 뒤 가져오기 확인을 누르고 저장 완료를 확인합니다.

카페 이름, 카페 내 메뉴 이름, 참석자 이름이 같은 항목은 재사용합니다. 이름 앞뒤 공백을 제거하며 대소문자는 구분합니다. 같은 메뉴의 가격이 다르면 가져오기 전체를 중단하므로 가격을 먼저 확인하세요. 기존에 있는 선호도는 덮어쓰지 않고 비어 있는 선호도만 보충합니다. 동명이인은 같은 참석자로 처리하므로 필요하다면 이전 전에 구분되는 이름으로 정리하세요. 신규 ID는 UUID로 생성합니다. 동일 파일 재가져오기는 중복 항목을 추가하지 않습니다.

이전 범위는 요청한 카페·메뉴·참석자·선호도입니다. 날짜를 확정할 수 없는 기존 임시 주문과 문자열 기록은 서버 주문으로 변환하지 않으며 원본 JSON 백업에 보존합니다. 백업 JSON에는 참석자 이름 등이 있으므로 사내 보관 정책에 맞게 관리하세요.

## 운영

입력 후 250ms에 저장하고 저장 완료를 표시합니다. 통신 실패·충돌 시 편집을 멈추며 로컬 작업 내용을 백업할 수 있습니다. 페이지 종료 전에는 저장 완료를 확인해야 합니다. 닫기 경고와 백그라운드 전환 시 저장 시도가 있지만 모바일 강제 종료·오프라인에서 미저장 입력 보존을 보장하지 않습니다.

다른 담당자의 저장은 5초 폴링으로 반영합니다. 작성 중인 미저장 내용이나 입력 중인 필드가 있으면 자동 반영을 미룹니다. 한국 날짜가 바뀌면 저장되지 않은 변경이 없는 상태에서 다음 날짜를 불러옵니다. 변경이 남아 있다면 백업·다시 불러오기를 안내합니다.

전체 초기화는 관리자만 실행하며 계정·승인 프로필은 남깁니다. 초기화 전에는 Supabase DB 백업을 확보하세요. 일반 카페·참석자 CRUD와 주문 작성은 비로그인 사용자에게 허용됩니다.

원래 녹색·카드·중앙 640px 레이아웃·4개 탭·전환 모션을 유지했습니다. 상단에는 관리자 로그인 버튼만 배치하고 로그인 입력은 dialog 창으로 분리했습니다. 데이터 이전 도구는 참석자 탭의 접이식 데이터 관리, 카페 이름 수정은 카페 탭, 완료 재편집은 주문서 탭에 배치했습니다. 서버 설정 파일을 분리하기 위해 HTML과 JavaScript를 나눴으며 프레임워크는 도입하지 않았습니다. Supabase SDK 2.57.4는 esm.sh에서 가져오므로 해당 CDN과 Supabase 접근이 필요합니다.

## 검증

`npm.cmd test` 또는 `node tests/local.cjs`, `node tests/sync.cjs`를 실행합니다. 자동 테스트는 로컬 DOM 대역과 모의 서버로 동작하며 실제 DB/RLS 통과를 뜻하지 않습니다. 실제 연결 후 필수 시나리오는 TESTING.md를 따릅니다.

공식 참고: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [API keys](https://supabase.com/docs/guides/getting-started/api-keys), [Vercel 환경변수](https://vercel.com/docs/environment-variables), [Build 설정](https://vercel.com/docs/builds/configure-a-build).

두 Supabase 환경변수가 모두 없으면 미연결 화면을 먼저 배포합니다. 이 상태에서는 주문 저장·관리자 로그인을 사용할 수 없습니다. 둘 중 하나만 설정되면 빌드는 실패합니다. 두 값을 설정한 뒤 재배포하면 공용 저장소에 연결됩니다.

SQL Editor에서 직접 001~004 적용 후에는 `supabase/record-applied-migrations.sql`로 적용 이력을 기록합니다. 기존 이력이 있는 DB에는 이미 적용된 버전만 기록해야 합니다. 현재 프로젝트는 001~004 적용 이력을 기록했습니다.

로컬 `.env.local`에 URL·publishable key를 넣으면 `node serve.cjs`가 이를 읽습니다. 해당 파일은 Git에서 제외됩니다. Node.js 24에서 검증했습니다. 실제 연결 읽기 점검은 `node tests/live-read.cjs`로 수행할 수 있으며 데이터를 변경하지 않습니다.

004는 PostgREST API 세션의 safe-update 보호가 활성화된 환경에서도 저장되도록 모든 DELETE에 명시적인 WHERE 조건을 추가합니다. 보호 설정은 끄지 않습니다.
## 커피 배너

첨부 레퍼런스를 바탕으로 커피 사진과 새싹 로고를 적용했습니다. 문구와 집계 숫자는 HTML이며 모바일에서는 사진 위치·크기를 조정합니다. 이미지 파일은 `assets/coffee-banner.jpg`이고, 내장 image_gen으로 제작한 최종 프롬프트는 `assets/README.md`에 보관했습니다. 빌드 시에는 JPEG만 공개 디렉터리로 복사합니다.
