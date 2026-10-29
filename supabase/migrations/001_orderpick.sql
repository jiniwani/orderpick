create table public.profiles(id uuid primary key references auth.users(id) on delete cascade, approved boolean not null default false, role text not null default 'operator' check(role in ('operator','admin')));
create table public.app_state(id boolean primary key default true check(id), revision bigint not null default 0);
insert into public.app_state values(true,0);
create table public.cafes(id text primary key, name text not null check(length(trim(name)) between 1 and 100), unique(name));
create table public.menus(id text primary key, cafe_id text not null references public.cafes on delete cascade, name text not null check(length(trim(name)) between 1 and 100), price numeric not null check(price>=0 and price<=10000000), unique(cafe_id,name), unique(id,cafe_id));
create table public.attendees(id text primary key,name text not null unique check(length(trim(name)) between 1 and 100),preferred_cafe_id text references public.cafes on delete set null);
create table public.preferences(attendee_id text references public.attendees on delete cascade,cafe_id text references public.cafes on delete cascade,menu_id text not null, primary key(attendee_id,cafe_id),foreign key(menu_id,cafe_id) references public.menus(id,cafe_id) on delete cascade);
create table public.orders(id uuid primary key default gen_random_uuid(), order_date date not null unique, owner_id uuid references public.profiles on delete set null, status text not null default 'draft' check(status in ('draft','completed')), cafe_id text references public.cafes on delete set null, draft jsonb not null default '{}', receipt jsonb, snapshot jsonb, updated_at timestamptz not null default now());
create table public.order_items(order_id uuid references public.orders on delete cascade,attendee_id text references public.attendees on delete set null, menu_id text references public.menus on delete set null, attendee_name text not null,menu_name text not null,temperature text not null check(temperature in ('ICE','HOT')),size text not null,strength text not null default '기본',note text not null default '',price numeric not null check(price>=0),id uuid primary key default gen_random_uuid());
create function public.is_approved() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from profiles where id=auth.uid() and approved) $$;
create function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from profiles where id=auth.uid() and approved and role='admin') $$;
alter table public.profiles enable row level security;
create policy own_profile on public.profiles for select to authenticated using(id=auth.uid());
do $$ declare t text; begin foreach t in array array['app_state','cafes','menus','attendees','preferences','orders','order_items'] loop execute format('alter table public.%I enable row level security',t); execute format('create policy approved_read on public.%I for select to authenticated using(public.is_approved())',t); end loop; end $$;
-- All mutations use the transaction RPC. Direct REST writes have no policies.
create function public.load_state(day date) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; begin
if not is_approved() then raise exception 'APPROVAL_REQUIRED'; end if;
select jsonb_build_object('revision',(select revision from app_state),'status',coalesce((select status from orders where order_date=day),'draft'),'data',jsonb_build_object(
'cafes',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'menu',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'price',m.price) order by m.name) from menus m where m.cafe_id=c.id),'[]'::jsonb)) order by c.name) from cafes c),'[]'::jsonb),
'people',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'preferredCafeId',coalesce(a.preferred_cafe_id,''),'favorites',coalesce((select jsonb_object_agg(p.cafe_id||':'||a.id,p.menu_id) from preferences p where p.attendee_id=a.id),'{}'::jsonb)) order by a.name) from attendees a),'[]'::jsonb),
'cafeId',coalesce((select cafe_id from orders where order_date=day),(select id from cafes order by name limit 1),''),
'orders',coalesce((select draft from orders where order_date=day),'{}'::jsonb),
'history',coalesce((select jsonb_agg(x.receipt order by x.order_date desc) from (select receipt,order_date from orders where receipt is not null order by order_date desc limit 30)x),'[]'::jsonb))) into result; if exists(select 1 from orders where order_date=day and status='completed') then result:=jsonb_set(result,'{data}',(select snapshot from orders where order_date=day)||jsonb_build_object('history',result->'data'->'history')); end if; return result; end $$;
create function public.save_state(day date, expected bigint, body jsonb, action text default 'save') returns jsonb language plpgsql security definer set search_path=public as $$
declare rev bigint;c jsonb;m jsonb;p jsonb;f record;o jsonb;oid uuid; cid text; begin
if not is_approved() then raise exception 'APPROVAL_REQUIRED'; end if;
select revision into rev from app_state where id=true for update;
if expected is null or rev<>expected then raise exception 'VERSION_CONFLICT'; end if;
if action not in ('save','complete','reopen','reset') then raise exception 'INVALID_ACTION'; end if;
if action='reset' then
 if not is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
 delete from orders;delete from attendees;delete from cafes;
else
 if exists(select 1 from orders where order_date=day and status='completed') and action<>'reopen' then raise exception 'ORDER_COMPLETED'; end if;
 if action='reopen' then
 update orders set status='draft',owner_id=auth.uid(),updated_at=now() where order_date=day;
 else
 if jsonb_typeof(body->'cafes') is distinct from 'array' or jsonb_typeof(body->'people') is distinct from 'array' then raise exception 'INVALID_DATA'; end if;
 delete from preferences;
 for c in select * from jsonb_array_elements(body->'cafes') loop
 insert into cafes values(c->>'id',c->>'name') on conflict(id) do update set name=excluded.name;
 for m in select * from jsonb_array_elements(c->'menu') loop
 insert into menus values(m->>'id',c->>'id',m->>'name',(m->>'price')::numeric) on conflict(id) do update set name=excluded.name,price=excluded.price,cafe_id=excluded.cafe_id;
 end loop; end loop;
 for p in select * from jsonb_array_elements(body->'people') loop
 insert into attendees values(p->>'id',p->>'name',nullif(p->>'preferredCafeId','')) on conflict(id) do update set name=excluded.name,preferred_cafe_id=excluded.preferred_cafe_id;
 end loop;
 delete from attendees where id not in(select x->>'id' from jsonb_array_elements(body->'people')x);
 delete from menus where id not in(select m->>'id' from jsonb_array_elements(body->'cafes')c cross join lateral jsonb_array_elements(c->'menu')m);
 delete from cafes where id not in(select x->>'id' from jsonb_array_elements(body->'cafes')x);
 for p in select * from jsonb_array_elements(body->'people') loop
 for f in select key,value from jsonb_each_text(coalesce(p->'favorites','{}')) loop
 cid:=left(f.key,length(f.key)-length(p->>'id')-1);
 if exists(select 1 from menus where id=f.value and cafe_id=cid) then insert into preferences values(p->>'id',cid,f.value); end if;
 end loop; end loop;
 insert into orders(order_date,owner_id,cafe_id,draft) values(day,auth.uid(),nullif(body->>'cafeId',''),body->'orders') on conflict(order_date) do update set owner_id=auth.uid(),cafe_id=excluded.cafe_id,draft=excluded.draft,updated_at=now() returning id into oid;
 delete from order_items where order_id=oid;
 for p in select * from jsonb_array_elements(body->'people') loop
 o:=body->'orders'->((body->>'cafeId')||':'||(p->>'id'));
 if coalesce((o->>'on')::boolean,false) then
 insert into order_items(order_id,attendee_id,menu_id,attendee_name,menu_name,temperature,size,strength,note,price)
 select oid,p->>'id',id,p->>'name',name,o->>'temp',o->>'size',coalesce(o->>'strength','기본'),coalesce(o->>'note',''),price from menus where id=o->>'menuId' and cafe_id=body->>'cafeId';
 if not found then raise exception 'INVALID_MENU'; end if;
 end if; end loop;
 if action='complete' then
 if not exists(select 1 from order_items where order_id=oid) then raise exception 'EMPTY_ORDER'; end if;
 update orders set status='completed',snapshot=body-'receiptText'-'history',receipt=jsonb_build_object('date',day::text,'cafe',(select name from cafes where id=body->>'cafeId'),'count',(select count(*) from order_items where order_id=oid),'total',(select sum(price) from order_items where order_id=oid),'text',body->>'receiptText') where id=oid;
 end if;
 end if;
end if;
update app_state set revision=revision+1 where id=true;
return load_state(day); end $$;
revoke all on public.profiles,public.app_state,public.cafes,public.menus,public.attendees,public.preferences,public.orders,public.order_items from anon,authenticated;
grant select on public.profiles,public.app_state,public.cafes,public.menus,public.attendees,public.preferences,public.orders,public.order_items to authenticated;
revoke all on function public.load_state(date),public.save_state(date,bigint,jsonb,text),public.is_approved(),public.is_admin() from public, anon, authenticated;
grant execute on function public.load_state(date),public.save_state(date,bigint,jsonb,text),public.is_approved(),public.is_admin() to authenticated;

alter table public.cafes add constraint cafe_safe_id check(id ~ '^[A-Za-z0-9_-]{1,80}$');
alter table public.menus add constraint menu_safe_id check(id ~ '^[A-Za-z0-9_-]{1,80}$');
alter table public.attendees add constraint attendee_safe_id check(id ~ '^[A-Za-z0-9_-]{1,80}$');
