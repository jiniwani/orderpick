-- Applied with a private backup on 2026-10-30.
-- Empty means unspecified; legacy orders are not assumed to be dine-in.
begin;
alter table public.order_items add column dining_mode text not null default ''
check(dining_mode in ('','dine_in','takeout'));
-- Preserve catalog validation, account locks/revisions and the 007 photo reset.
create or replace function public.save_state(day date,expected bigint,body jsonb,action text default 'save') returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;known numeric;unknown bigint;begin
 result:=public.save_catalog_state(day,expected,body,action);
 if action in ('save','complete') then
 update public.order_items i set dining_mode=coalesce(body->'orders'->((body->>'cafeId')||':'||i.attendee_id)->>'diningMode','')
 from public.orders o where o.id=i.order_id and o.account_id=i.account_id
 and o.account_id=auth.uid() and o.order_date=day;
 end if;
 if action='reset' then delete from public.account_photo_settings where account_id=auth.uid();end if;
 if action='complete' then
 select coalesce(sum(i.price),0),count(*) filter(where i.price is null) into known,unknown
 from public.order_items i join public.orders o on o.id=i.order_id and o.account_id=i.account_id
 where o.account_id=auth.uid() and o.order_date=day;
 update public.orders set receipt=receipt||jsonb_build_object('total',case when unknown>0 then null else known end,'knownTotal',known,'unknownCount',unknown)
 where account_id=auth.uid() and order_date=day;
 result:=public.load_state(day);
 end if;
 return result;
end $$;
revoke all on function public.save_state(date,bigint,jsonb,text) from public,anon,authenticated;
grant execute on function public.save_state(date,bigint,jsonb,text) to authenticated;
commit;
