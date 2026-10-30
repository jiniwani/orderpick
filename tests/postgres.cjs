// Local PostgreSQL/WASM only; never contacts the live Supabase database.
const fs=require('fs'),assert=require('assert');
const {PGlite}=require('@electric-sql/pglite');
(async()=>{const db=new PGlite();try{
await db.exec(`create role anon;create role authenticated;create schema auth;grant usage on schema auth to anon,authenticated;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
for(const file of fs.readdirSync('supabase/migrations').filter(x=>/^00[1-4]_/.test(x)).sort())await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
await db.exec(`insert into auth.users values('00000000-0000-4000-8000-000000000001','legacy-admin@example.invalid');insert into public.profiles values('00000000-0000-4000-8000-000000000001',true,'admin');insert into public.cafes values('legacy','Legacy preserved');insert into public.menus values('legacy_menu','legacy','Legacy drink',4500);insert into public.attendees values('legacy_person','Legacy person','legacy');insert into public.preferences values('legacy_person','legacy','legacy_menu');`);
await db.exec("select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false)");
const old=(await db.query("select public.load_state('2098-12-31') as state")).rows[0].state;old.data.orders={'legacy:legacy_person':{on:true,menuId:'legacy_menu',temp:'ICE',size:'기본',strength:'기본',note:''}};old.data.receiptText='Legacy receipt';await db.query("select public.save_state('2098-12-31',$1,$2::jsonb,'complete')",[old.revision,JSON.stringify(old.data)]);
await db.exec(fs.readFileSync('supabase/migrations/005_account_isolation.sql','utf8'));
await db.exec(fs.readFileSync('supabase/migrations/006_account_state_grants.sql','utf8'));
// Minimal Storage metadata model. Real Storage upload/size enforcement is separate.
await db.exec(`create schema storage;grant usage on schema storage to anon,authenticated;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text references storage.buckets(id),name text,metadata jsonb,created_at timestamptz default now(),primary key(bucket_id,name));alter table storage.objects enable row level security;grant select,insert,update,delete on storage.objects to anon,authenticated;`);
await db.exec('create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text);');
await db.exec(fs.readFileSync('supabase/migrations/007_attendee_photos.sql','utf8'));
await db.exec(fs.readFileSync('supabase/migrations/008_unknown_menu_price.sql','utf8'));
await db.exec(fs.readFileSync('supabase/migrations/009_order_dining_mode.sql','utf8'));
const preserved=(await db.query("select public.load_state('2098-12-31') as state")).rows[0].state;assert.equal(preserved.status,'completed');assert.equal(preserved.data.history[0].total,4500);assert.equal(preserved.data.cafes[0].name,'Legacy preserved');
let q=await db.query(`select account_id::text from public.cafes where id='legacy'`);assert.equal(q.rows[0].account_id,'00000000-0000-4000-8000-000000000001');
await db.exec(fs.readFileSync('tests/database-account-isolation.sql','utf8'));
await db.exec(fs.readFileSync('tests/database-photos.sql','utf8'));
await db.exec(fs.readFileSync('tests/database-unknown-price.sql','utf8'));
await db.exec(fs.readFileSync('tests/database-dining-mode.sql','utf8'));
q=await db.query('select count(*)::int as n from auth.users');assert.equal(q.rows[0].n,1,'Fixtures must rollback');
console.log('PASS: PostgreSQL local migration 001–009; legacy preservation; A/B isolation, RLS, revisions, completion, resets, guest denial; private photo ownership, limits, no overwrite, reference guard and orphan cleanup; unknown/mixed/free order prices, completion and history; dining mode draft/items/snapshot/isolation; fixtures rolled back');
}finally{await db.close()}})().catch(e=>{console.error(e.message,e.position,e.query?.slice(Math.max(0,Number(e.position)-80),Number(e.position)+100));process.exitCode=1});
