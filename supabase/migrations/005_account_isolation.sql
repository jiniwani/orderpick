-- Run once after 001-004. Atomic migration; source copies are private backups.
begin;
lock table public.app_state,public.cafes,public.menus,public.attendees,public.preferences,public.orders,public.order_items in access exclusive mode;
create schema orderpick_backup_005;
revoke all on schema orderpick_backup_005 from public,anon,authenticated;
do $$ declare t text; owner_account uuid; begin
 select id into owner_account from public.profiles where approved and role='admin';
 if (select count(*) from public.profiles where approved and role='admin')<>1 then raise exception 'ONE_LEGACY_ADMIN_REQUIRED'; end if;
 foreach t in array array['app_state','profiles','cafes','menus','attendees','preferences','orders','order_items'] loop
 execute format('create table orderpick_backup_005.%I as table public.%I',t,t);
 execute format('revoke all on orderpick_backup_005.%I from public,anon,authenticated',t);
 if t not in ('profiles','app_state') then
 execute format('alter table public.%I add column account_id uuid references public.profiles(id) on delete cascade',t);
 execute format('update public.%I set account_id=$1',t) using owner_account;
 execute format('alter table public.%I alter column account_id set not null',t);
 end if;
 end loop;
end $$;
-- Composite ownership references. Keep legacy IDs, but never allow an ID takeover.
alter table public.cafes drop constraint cafes_name_key, add unique(account_id,name),add unique(account_id,id);
alter table public.attendees drop constraint attendees_name_key,drop constraint attendees_preferred_cafe_id_fkey,add unique(account_id,name),add unique(account_id,id),add foreign key(account_id,preferred_cafe_id) references public.cafes(account_id,id) on delete set null(preferred_cafe_id);
alter table public.menus drop constraint menus_cafe_id_fkey,add unique(account_id,id),add unique(account_id,id,cafe_id),add foreign key(account_id,cafe_id) references public.cafes(account_id,id) on delete cascade;
alter table public.preferences drop constraint preferences_attendee_id_fkey,drop constraint preferences_cafe_id_fkey,drop constraint preferences_menu_id_cafe_id_fkey,add foreign key(account_id,attendee_id) references public.attendees(account_id,id) on delete cascade,add foreign key(account_id,cafe_id) references public.cafes(account_id,id) on delete cascade,add foreign key(account_id,menu_id,cafe_id) references public.menus(account_id,id,cafe_id) on delete cascade;
alter table public.orders drop constraint orders_order_date_key,drop constraint orders_cafe_id_fkey,add unique(account_id,order_date),add unique(account_id,id),add foreign key(account_id,cafe_id) references public.cafes(account_id,id) on delete set null(cafe_id);
alter table public.order_items drop constraint order_items_order_id_fkey,drop constraint order_items_attendee_id_fkey,drop constraint order_items_menu_id_fkey,add foreign key(account_id,order_id) references public.orders(account_id,id) on delete cascade,add foreign key(account_id,attendee_id) references public.attendees(account_id,id) on delete set null(attendee_id),add foreign key(account_id,menu_id) references public.menus(account_id,id) on delete set null(menu_id);
create table public.account_state(account_id uuid primary key references public.profiles(id) on delete cascade,revision bigint not null default 0);
insert into public.account_state select id,(select revision from public.app_state where id=true) from public.profiles;
alter table public.account_state enable row level security;
create policy account_read on public.account_state for select to authenticated using(account_id=auth.uid() and public.is_approved());
create or replace function public.is_approved() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.profiles where id=auth.uid() and approved) $$;
do $$ declare t text; begin foreach t in array array['app_state','cafes','menus','attendees','preferences','orders','order_items'] loop
 execute format('drop policy if exists guest_read on public.%I',t);
 execute format('drop policy if exists approved_read on public.%I',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 if t<>'app_state' then
 execute format('create policy account_read on public.%I for select to authenticated using(account_id=auth.uid() and public.is_approved())',t);
 execute format('grant select on public.%I to authenticated',t);
 end if;
end loop; end $$;
grant select on public.account_state to authenticated;
-- Signups stay disabled in Auth. Dashboard-created users get an independent account.
create function public.create_orderpick_account() returns trigger language plpgsql security definer set search_path=public as $$ begin
 insert into public.profiles(id,approved,role) values(new.id,true,'operator');
 insert into public.account_state(account_id) values(new.id);
 return new; end $$;
revoke all on function public.create_orderpick_account() from public,anon,authenticated;
create trigger orderpick_account_created after insert on auth.users for each row execute function public.create_orderpick_account();
create or replace function public.load_state(day date) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; account uuid:=auth.uid(); begin
 if not public.is_approved() then raise exception 'APPROVAL_REQUIRED'; end if;
 select jsonb_build_object('revision',(select revision from account_state where account_id=account),'status',coalesce((select status from orders where account_id=account and order_date=day),'draft'),'data',jsonb_build_object(
 'cafes',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'menu',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'price',m.price) order by m.name) from menus m where m.account_id=account and m.cafe_id=c.id),'[]'::jsonb)) order by c.name) from cafes c where c.account_id=account),'[]'::jsonb),
 'people',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'preferredCafeId',coalesce(a.preferred_cafe_id,''),'favorites',coalesce((select jsonb_object_agg(p.cafe_id||':'||a.id,p.menu_id) from preferences p where p.account_id=account and p.attendee_id=a.id),'{}'::jsonb)) order by a.name) from attendees a where a.account_id=account),'[]'::jsonb),
 'cafeId',coalesce((select cafe_id from orders where account_id=account and order_date=day),(select id from cafes where account_id=account order by name limit 1),''),
 'orders',coalesce((select draft from orders where account_id=account and order_date=day),'{}'::jsonb),
 'history',coalesce((select jsonb_agg(x.receipt order by x.order_date desc) from (select receipt,order_date from orders where account_id=account and receipt is not null order by order_date desc limit 30)x),'[]'::jsonb))) into result;
 if exists(select 1 from orders where account_id=account and order_date=day and status='completed') then result:=jsonb_set(result,'{data}',(select snapshot from orders where account_id=account and order_date=day)||jsonb_build_object('history',result->'data'->'history')); end if;
 return result; end $$;
create function public.get_revision() returns bigint language plpgsql security definer set search_path=public as $$ begin
 if not public.is_approved() then raise exception 'APPROVAL_REQUIRED'; end if;
 return (select revision from public.account_state where account_id=auth.uid()); end $$;
create or replace function public.save_state(day date,expected bigint,body jsonb,action text default 'save') returns jsonb language plpgsql security definer set search_path=public as $$
declare account uuid:=auth.uid(); rev bigint;c jsonb;m jsonb;p jsonb;f record;o jsonb;oid uuid;cid text; begin
 if not public.is_approved() then raise exception 'APPROVAL_REQUIRED'; end if;
 select revision into rev from account_state where account_id=account for update;
 if expected is null or rev is null or rev<>expected then raise exception 'VERSION_CONFLICT'; end if;
 if day is null or action is null or action not in ('save','complete','reopen','reset') then raise exception 'INVALID_ACTION'; end if;
 if action='reset' then
 if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
 delete from orders where account_id=account;delete from attendees where account_id=account;delete from cafes where account_id=account;
 else
 if exists(select 1 from orders where account_id=account and order_date=day and status='completed') and action<>'reopen' then raise exception 'ORDER_COMPLETED'; end if;
 if action='reopen' then
 update orders set status='draft',owner_id=account,updated_at=now() where account_id=account and order_date=day;
 else
 if jsonb_typeof(body->'cafes') is distinct from 'array' or jsonb_typeof(body->'people') is distinct from 'array' or jsonb_typeof(body->'orders') is distinct from 'object' then raise exception 'INVALID_DATA'; end if;
 -- Reject all cross-account IDs before any changes; PK conflicts cannot reveal or overwrite rows.
 if exists(select 1 from cafes where account_id<>account and id in(select x->>'id' from jsonb_array_elements(body->'cafes')x))
 or exists(select 1 from attendees where account_id<>account and id in(select x->>'id' from jsonb_array_elements(body->'people')x))
 or exists(select 1 from menus where account_id<>account and id in(select me.value->>'id' from jsonb_array_elements(body->'cafes')ce(value) cross join lateral jsonb_array_elements(ce.value->'menu')me(value))) then raise exception 'INVALID_DATA'; end if;
 delete from preferences where account_id=account;
 for c in select * from jsonb_array_elements(body->'cafes') loop
 insert into cafes(id,name,account_id) values(c->>'id',c->>'name',account) on conflict(id) do update set name=excluded.name where cafes.account_id=account;
 for m in select * from jsonb_array_elements(c->'menu') loop
 insert into menus(id,cafe_id,name,price,account_id) values(m->>'id',c->>'id',m->>'name',(m->>'price')::numeric,account) on conflict(id) do update set name=excluded.name,price=excluded.price,cafe_id=excluded.cafe_id where menus.account_id=account;
 end loop;end loop;
 for p in select * from jsonb_array_elements(body->'people') loop
 insert into attendees(id,name,preferred_cafe_id,account_id) values(p->>'id',p->>'name',nullif(p->>'preferredCafeId',''),account) on conflict(id) do update set name=excluded.name,preferred_cafe_id=excluded.preferred_cafe_id where attendees.account_id=account;
 end loop;
 delete from attendees where account_id=account and id not in(select x->>'id' from jsonb_array_elements(body->'people')x);
 delete from menus where account_id=account and id not in(select me.value->>'id' from jsonb_array_elements(body->'cafes')ce(value) cross join lateral jsonb_array_elements(ce.value->'menu')me(value));
 delete from cafes where account_id=account and id not in(select x->>'id' from jsonb_array_elements(body->'cafes')x);
 for p in select * from jsonb_array_elements(body->'people') loop
 for f in select key,value from jsonb_each_text(coalesce(p->'favorites','{}')) loop
 cid:=left(f.key,length(f.key)-length(p->>'id')-1);
 if exists(select 1 from menus where account_id=account and id=f.value and cafe_id=cid) then insert into preferences(attendee_id,cafe_id,menu_id,account_id) values(p->>'id',cid,f.value,account); end if;
 end loop;end loop;
 insert into orders(order_date,owner_id,cafe_id,draft,account_id) values(day,account,nullif(body->>'cafeId',''),body->'orders',account) on conflict(account_id,order_date) do update set owner_id=account,cafe_id=excluded.cafe_id,draft=excluded.draft,updated_at=now() returning id into oid;
 delete from order_items where account_id=account and order_id=oid;
 for p in select * from jsonb_array_elements(body->'people') loop
 o:=body->'orders'->((body->>'cafeId')||':'||(p->>'id'));
 if coalesce((o->>'on')::boolean,false) then
 insert into order_items(order_id,attendee_id,menu_id,attendee_name,menu_name,temperature,size,strength,note,price,account_id)
 select oid,p->>'id',id,p->>'name',name,o->>'temp',o->>'size',coalesce(o->>'strength','기본'),coalesce(o->>'note',''),price,account from menus where account_id=account and id=o->>'menuId' and cafe_id=body->>'cafeId';
 if not found then raise exception 'INVALID_MENU'; end if;
 end if;end loop;
 if action='complete' then
 if not exists(select 1 from order_items where account_id=account and order_id=oid) then raise exception 'EMPTY_ORDER'; end if;
 update orders set status='completed',snapshot=body-'receiptText'-'history',receipt=jsonb_build_object('date',day::text,'cafe',(select name from cafes where account_id=account and id=body->>'cafeId'),'count',(select count(*) from order_items where account_id=account and order_id=oid),'total',(select sum(price) from order_items where account_id=account and order_id=oid),'text',body->>'receiptText') where account_id=account and id=oid;
 end if;
 end if;
 end if;
 update account_state set revision=revision+1 where account_id=account;
 return load_state(day);end $$;
create function public.export_account() returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb:='{}';t text;rows jsonb;begin
 if not public.is_approved() then raise exception 'APPROVAL_REQUIRED';end if;
 foreach t in array array['cafes','menus','attendees','preferences','orders','order_items'] loop
 execute format('select coalesce(jsonb_agg(to_jsonb(r)),''[]''::jsonb) from public.%I r where account_id=$1',t) into rows using auth.uid();
 result:=jsonb_set(result,array[t],rows);
 end loop;return result;end $$;
revoke all on function public.export_account() from public,anon,authenticated;
grant execute on function public.export_account() to authenticated;
-- No public or anonymous data API remains.
revoke all on function public.load_state(date),public.save_state(date,bigint,jsonb,text),public.get_revision(),public.is_approved(),public.is_admin() from public,anon,authenticated;
grant execute on function public.load_state(date),public.save_state(date,bigint,jsonb,text),public.get_revision(),public.is_approved(),public.is_admin() to authenticated;
-- Verify all legacy rows survived, and assigned ownership is complete.
do $$ declare t text; before_count bigint; after_count bigint; begin
 foreach t in array array['cafes','menus','attendees','preferences','orders','order_items'] loop
 execute format('select count(*) from orderpick_backup_005.%I',t) into before_count;
 execute format('select count(*) from public.%I',t) into after_count;
 if before_count<>after_count then raise exception 'MIGRATION_COUNT_MISMATCH: %',t;end if;
 end loop;
end $$;
commit;
