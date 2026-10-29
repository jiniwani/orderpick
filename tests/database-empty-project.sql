-- Run with SQL Editor postgres role. All draft writes are rolled back.
begin;
set local role anon;
do $$
declare r jsonb; v bigint; empty_body jsonb := '{"cafes":[],"people":[],"cafeId":"","orders":{},"history":[]}'::jsonb;
begin
  select revision into v from public.app_state where id=true;
  r := public.load_state('2099-01-01');
  assert jsonb_typeof(r->'data'->'cafes')='array', 'Guest read failed';
  -- Only use on an empty new project to avoid even transactional catalog changes.
  assert jsonb_array_length(r->'data'->'cafes')=0 and jsonb_array_length(r->'data'->'people')=0, 'Run write probe only on empty project';
  r := public.save_state('2099-01-01',v,empty_body,'save');
  assert (r->>'revision')::bigint=v+1, 'Guest save revision failed';
  r := public.save_state('2099-01-01',v+1,empty_body,'save');
  assert (select count(*)=1 from public.orders where order_date='2099-01-01'), 'Duplicate daily order';
  begin
    perform public.save_state('2099-01-01',v,empty_body,'save');
    raise exception 'TEST_STALE_VERSION_ACCEPTED';
  exception when others then if sqlerrm<>'VERSION_CONFLICT' then raise; end if; end;
  begin
    perform public.save_state('2099-01-01',null,empty_body,'save');
    raise exception 'TEST_NULL_VERSION_ACCEPTED';
  exception when others then if sqlerrm<>'VERSION_CONFLICT' then raise; end if; end;
  begin
    perform public.save_state('2099-01-01',v+2,empty_body,'reset');
    raise exception 'TEST_GUEST_RESET_ACCEPTED';
  exception when others then if sqlerrm<>'ADMIN_REQUIRED' then raise; end if; end;
  begin
    perform public.save_state('2099-01-01',v+2,empty_body,'complete');
    raise exception 'TEST_EMPTY_COMPLETION_ACCEPTED';
  exception when others then if sqlerrm<>'EMPTY_ORDER' then raise; end if; end;
  begin
    insert into public.cafes(id,name) values('permission_probe','permission_probe');
    raise exception 'TEST_DIRECT_INSERT_ACCEPTED';
  exception when insufficient_privilege then null; end;
  begin
    perform id from public.profiles;
    raise exception 'TEST_GUEST_PROFILES_READ_ACCEPTED';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'PASS: guest read/save; unique day; version conflict; null version; admin reset guard; empty completion; direct write/profile access denied. All writes rolled back.' as result;
