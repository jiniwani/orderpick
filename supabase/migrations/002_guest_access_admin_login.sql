-- User-selected mode: public shared orders; admin authentication only for reset.
create or replace function public.is_approved() returns boolean language sql stable security definer set search_path=public as $$ select true $$;
create or replace function public.save_state(day date, expected bigint, body jsonb, action text default 'save') returns jsonb language plpgsql security definer set search_path=public as $$
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
 update orders set status='draft',owner_id=(select id from profiles where id=auth.uid() and approved),updated_at=now() where order_date=day;
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
 insert into orders(order_date,owner_id,cafe_id,draft) values(day,(select id from profiles where id=auth.uid() and approved),nullif(body->>'cafeId',''),body->'orders') on conflict(order_date) do update set owner_id=(select id from profiles where id=auth.uid() and approved),cafe_id=excluded.cafe_id,draft=excluded.draft,updated_at=now() returning id into oid;
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
grant execute on function public.is_approved(), public.load_state(date), public.save_state(date,bigint,jsonb,text) to anon;
grant select on public.app_state,public.cafes,public.menus,public.attendees,public.preferences,public.orders,public.order_items to anon;
do $$ declare t text; begin foreach t in array array['app_state','cafes','menus','attendees','preferences','orders','order_items'] loop execute format('create policy guest_read on public.%I for select to anon using(true)',t); end loop; end $$;
