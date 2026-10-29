-- All fixtures are local, transactional and rolled back.
begin;
insert into auth.users values('00000000-0000-4000-8000-0000000000a7','a7@example.invalid'),('00000000-0000-4000-8000-0000000000b7','b7@example.invalid');
insert into public.attendees(id,name,account_id) values('photo_a','A','00000000-0000-4000-8000-0000000000a7'),('photo_b','B','00000000-0000-4000-8000-0000000000b7');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a7',true);
set local role authenticated;
do $$declare s jsonb;p text:=auth.uid()::text||'/photo_a/00000000-0000-4000-8000-000000000001.jpg';begin
 s:=public.load_attendee_photos();if (s->>'enabled')::boolean or jsonb_array_length(s->'photos')<>0 then raise exception 'DEFAULT_NOT_OFF';end if;
 s:=public.set_attendee_photos_enabled(auth.uid(),0,true);
 begin perform public.set_attendee_photos_enabled(auth.uid(),0,false);raise exception 'STALE_ACCEPTED';exception when others then if sqlerrm<>'VERSION_CONFLICT' then raise;end if;end;
 begin perform public.set_attendee_photos_enabled('00000000-0000-4000-8000-0000000000b7',1,true);raise exception 'SPOOF';exception when others then if sqlerrm<>'APPROVAL_REQUIRED' then raise;end if;end;
 begin perform public.save_attendee_photo(auth.uid(),1,'photo_b',p);raise exception 'CROSS_PERSON';exception when others then if sqlerrm<>'INVALID_ATTENDEE' then raise;end if;end;
 begin perform public.save_attendee_photo(auth.uid(),1,'photo_a',p);raise exception 'MISSING_OBJECT';exception when others then if sqlerrm<>'INVALID_PHOTO' then raise;end if;end;
 insert into storage.objects(bucket_id,name,metadata) values('attendee-photos',p,'{"mimetype":"image/jpeg","size":50000}');
 s:=public.save_attendee_photo(auth.uid(),1,'photo_a',p);if jsonb_array_length(s->'photos')<>1 or (s->>'revision')::int<>2 then raise exception 'SAVE_FAILED';end if;
 delete from storage.objects where name=p;if not exists(select 1 from storage.objects where name=p) then raise exception 'REFERENCED_DELETED';end if;
 update storage.objects set metadata='{}' where name=p;if exists(select 1 from storage.objects where name=p and metadata='{}') then raise exception 'OVERWRITE';end if;
 begin insert into storage.objects(bucket_id,name,metadata) values('attendee-photos','00000000-0000-4000-8000-0000000000b7/photo_b/00000000-0000-4000-8000-000000000002.jpg','{}');raise exception 'CROSS_UPLOAD';exception when insufficient_privilege then null;end;
 begin insert into storage.objects(bucket_id,name,metadata) values('attendee-photos',auth.uid()::text||'/photo_a/original.png','{}');raise exception 'BAD_PATH';exception when insufficient_privilege then null;end;
end $$;
reset role;
-- A broad unrelated policy must not allow overwrite or guest/cross-account access.
create policy broad_fixture on storage.objects for all to anon,authenticated using(true) with check(true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000b7',true);
set local role authenticated;
do $$begin
 if exists(select 1 from storage.objects) or exists(select 1 from public.attendee_photos) or jsonb_array_length(public.load_attendee_photos()->'photos')<>0 then raise exception 'B_SAW_A';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a7',true);
set local role authenticated;
do $$declare p text:=auth.uid()::text||'/photo_a/00000000-0000-4000-8000-000000000001.jpg';begin
 update storage.objects set metadata='{}' where name=p;if exists(select 1 from storage.objects where metadata='{}') then raise exception 'BROAD_OVERWRITE';end if;
 perform public.save_attendee_photo(auth.uid(),2,'photo_a',null);
 delete from storage.objects where name=p;if exists(select 1 from storage.objects where name=p) then raise exception 'ORPHAN_NOT_REMOVABLE';end if;
 insert into storage.objects(bucket_id,name,metadata) values('attendee-photos',p,'{"mimetype":"image/png","size":1}');
 begin perform public.save_attendee_photo(auth.uid(),3,'photo_a',p);raise exception 'PNG_ACCEPTED';exception when others then if sqlerrm<>'INVALID_PHOTO' then raise;end if;end;
end $$;
reset role;
update storage.objects set metadata='{"mimetype":"image/jpeg","size":102401}',created_at=now()-interval '2 hours';
set local role authenticated;
do $$declare p text:=auth.uid()::text||'/photo_a/00000000-0000-4000-8000-000000000001.jpg';begin
 begin perform public.save_attendee_photo(auth.uid(),3,'photo_a',p);raise exception 'OVERSIZE';exception when others then if sqlerrm<>'INVALID_PHOTO' then raise;end if;end;
 if jsonb_array_length(public.list_attendee_photo_orphans())<>1 then raise exception 'ORPHAN_LIST';end if;
end $$;
reset role;
update public.profiles set role='admin' where id=auth.uid();
update storage.objects set metadata='{"mimetype":"image/jpeg","size":50000}';
set local role authenticated;
do $$begin
 perform public.save_attendee_photo(auth.uid(),3,'photo_a',auth.uid()::text||'/photo_a/00000000-0000-4000-8000-000000000001.jpg');
 if jsonb_array_length(public.list_attendee_photo_orphans())<>0 then raise exception 'REFERENCED_ORPHAN';end if;
 perform public.save_state('2099-01-01',4,jsonb_set(public.load_state('2099-01-01')->'data','{orders}','{}'));
 if jsonb_array_length(public.load_attendee_photos()->'photos')<>1 or not (public.load_attendee_photos()->>'enabled')::boolean then raise exception 'TODAY_RESET_DAMAGED_PHOTOS';end if;
 perform public.save_state('2099-01-01',5,'{}','reset');
 if (public.load_attendee_photos()->>'enabled')::boolean or exists(select 1 from public.attendee_photos) then raise exception 'RESET_PHOTOS';end if;
end $$;
reset role;
do $$begin
 if not exists(select 1 from public.attendees where id='photo_b') then raise exception 'RESET_CROSS_ACCOUNT';end if;
 if not exists(select 1 from storage.buckets where id='attendee-photos' and not public and file_size_limit=102400 and allowed_mime_types=array['image/jpeg']) then raise exception 'BUCKET_CONFIG';end if;
end $$;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$begin
 if exists(select 1 from storage.objects) then raise exception 'GUEST_STORAGE';end if;
 begin perform public.load_attendee_photos();raise exception 'GUEST_RPC';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'PASS: photo default, revisions, ownership, metadata validation, Storage RLS, no overwrite, reference guard, orphan cleanup and reset' as result;
