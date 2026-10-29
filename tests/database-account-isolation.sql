-- Transaction-only fixtures. No persistent users, cafes or attendees.
begin;
insert into auth.users(id,email) values('00000000-0000-4000-8000-0000000000a5','orderpick-test-a@example.invalid'),('00000000-0000-4000-8000-0000000000b5','orderpick-test-b@example.invalid');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a5',true);
do $$ declare s jsonb; b jsonb:='{"cafes":[{"id":"qa_a5","name":"Isolation test","menu":[{"id":"qa_ma5","name":"Drink","price":1000}]}],"people":[{"id":"qa_pa5","name":"Person","preferredCafeId":"qa_a5","favorites":{"qa_a5:qa_pa5":"qa_ma5"}}],"cafeId":"qa_a5","orders":{"qa_a5:qa_pa5":{"on":true,"menuId":"qa_ma5","temp":"ICE","size":"기본","strength":"기본","note":""}},"history":[],"receiptText":"QA"}'; begin
 s:=public.save_state('2099-01-01',0,b);
 if (s->>'revision')::bigint<>1 or jsonb_array_length(s->'data'->'cafes')<>1 then raise exception 'A_SAVE';end if;
 begin perform public.save_state('2099-01-01',0,b);raise exception 'STALE_ACCEPTED';exception when others then if sqlerrm<>'VERSION_CONFLICT' then raise;end if;end;
 perform public.save_state('2099-01-01',1,b,'complete');
 begin perform public.save_state('2099-01-01',2,b);raise exception 'COMPLETED_EDITED';exception when others then if sqlerrm<>'ORDER_COMPLETED' then raise;end if;end;
 s:=public.load_state('2099-01-02');if s->>'status'<>'draft' or jsonb_array_length(s->'data'->'history')<>1 then raise exception 'NEXT_DAY';end if;
 perform public.save_state('2099-01-01',2,b,'reopen');
 b:=jsonb_set(b,'{orders}','{}');s:=public.save_state('2099-01-01',3,b);
 if jsonb_array_length(s->'data'->'people')<>1 or s->'data'->'people'->0->'favorites'->>'qa_a5:qa_pa5'<>'qa_ma5' then raise exception 'RESET_DAMAGED_SETTINGS';end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000b5',true);
do $$ declare s jsonb;b jsonb;begin
 s:=public.load_state('2099-01-01');if jsonb_array_length(s->'data'->'cafes')<>0 or public.get_revision()<>0 then raise exception 'B_SAW_A';end if;
 b:='{"cafes":[{"id":"qa_a5","name":"Attempt takeover","menu":[]}],"people":[],"orders":{}}';
 begin perform public.save_state('2099-01-01',0,b);raise exception 'TAKEOVER_ACCEPTED';exception when others then if sqlerrm<>'INVALID_DATA' then raise;end if;end;
 b:='{"cafes":[{"id":"qa_b5","name":"Isolation test","menu":[]}],"people":[{"id":"qa_pb5","name":"Person","preferredCafeId":"qa_a5"}],"cafeId":"qa_b5","orders":{}}';
 begin perform public.save_state('2099-01-01',0,b);raise exception 'CROSS_REFERENCE_ACCEPTED';exception when foreign_key_violation then null;end;
 b:=jsonb_set(b,'{people,0,preferredCafeId}','"qa_b5"');s:=public.save_state('2099-01-01',0,b);
 if jsonb_array_length(s->'data'->'cafes')<>1 then raise exception 'B_SAVE';end if;
 if public.export_account()::text like '%qa_a5%' then raise exception 'EXPORT_LEAK';end if;
 if (select revision from public.account_state where account_id='00000000-0000-4000-8000-0000000000a5')<>4 then raise exception 'CROSS_ACCOUNT_REVISION';end if;
 begin perform public.save_state('2099-01-01',1,b,'reset');raise exception 'NONADMIN_RESET';exception when others then if sqlerrm<>'ADMIN_REQUIRED' then raise;end if;end;
end $$;
-- Real RLS paths as the API role, not just security-definer RPCs.
set local role authenticated;
do $$ begin
 if (select count(*) from public.cafes)<>1 or exists(select 1 from public.cafes where id='qa_a5') then raise exception 'RLS_LEAK';end if;
 begin insert into public.cafes(id,name,account_id) values('qa_direct','bad',auth.uid());raise exception 'DIRECT_WRITE';exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.profiles set role='admin' where id='00000000-0000-4000-8000-0000000000b5';
do $$ begin
 perform public.save_state('2099-01-01',1,'{}','reset');
 if exists(select 1 from public.cafes where account_id=auth.uid()) or not exists(select 1 from public.cafes where id='qa_a5') then raise exception 'RESET_SCOPE';end if;
end $$;
update public.profiles set approved=false where id='00000000-0000-4000-8000-0000000000b5';
do $$ begin begin perform public.load_state('2099-01-01');raise exception 'REVOKED_ACCOUNT';exception when others then if sqlerrm<>'APPROVAL_REQUIRED' then raise;end if;end;end $$;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$ begin
 begin perform public.load_state('2099-01-01');raise exception 'ANON_RPC';exception when insufficient_privilege then null;end;
 begin perform count(*) from public.cafes;raise exception 'ANON_READ';exception when insufficient_privilege then null;end;
end $$;
do $$ begin begin perform count(*) from public.account_state;raise exception 'ANON_REVISION_TABLE';exception when insufficient_privilege then null;end;end $$;
reset role;
rollback;
select 'PASS: account isolation, RLS, ID spoofing, cross-account FK, independent revisions, completion/reopen, next day, settings preservation, scoped admin reset, guest denial; all fixtures rolled back' as result;
