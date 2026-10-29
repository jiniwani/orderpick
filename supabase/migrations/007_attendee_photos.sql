-- Attendee photos. Applied after 006 with a private backup on 2026-10-29.
begin;
create table public.account_photo_settings(
 account_id uuid primary key references public.profiles(id) on delete cascade,
 enabled boolean not null default false
);
create table public.attendee_photos(
 account_id uuid not null references public.profiles(id) on delete cascade,
 attendee_id text not null,
 object_path text not null unique,
 primary key(account_id,attendee_id),
 foreign key(account_id,attendee_id) references public.attendees(account_id,id) on delete cascade,
 check(split_part(object_path,'/',1)=account_id::text and split_part(object_path,'/',2)=attendee_id
 and array_length(string_to_array(object_path,'/'),1)=3
 and split_part(object_path,'/',3) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$')
);
alter table public.account_photo_settings enable row level security;
alter table public.attendee_photos enable row level security;
revoke all on public.account_photo_settings,public.attendee_photos from public,anon,authenticated;
grant select on public.account_photo_settings,public.attendee_photos to authenticated;
create policy photo_settings_owner_read on public.account_photo_settings for select to authenticated using(account_id=auth.uid() and public.is_approved());
create policy attendee_photos_owner_read on public.attendee_photos for select to authenticated using(account_id=auth.uid() and public.is_approved());
-- Only compressed JPEGs. Originals are never uploaded by the app.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('attendee-photos','attendee-photos',false,102400,array['image/jpeg']);
-- Restrictive guards also protect this bucket if a broad policy is added later.
create policy attendee_photo_guest_guard on storage.objects as restrictive for all to anon
using(bucket_id<>'attendee-photos') with check(bucket_id<>'attendee-photos');
create policy attendee_photo_owner_guard on storage.objects as restrictive for all to authenticated
using(bucket_id<>'attendee-photos' or (public.is_approved() and split_part(name,'/',1)=auth.uid()::text))
with check(bucket_id<>'attendee-photos' or (public.is_approved() and split_part(name,'/',1)=auth.uid()::text
 and array_length(string_to_array(name,'/'),1)=3
 and split_part(name,'/',3) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
 and exists(select 1 from public.attendees where account_id=auth.uid() and id=split_part(storage.objects.name,'/',2))));
create policy attendee_photo_read on storage.objects for select to authenticated
using(bucket_id='attendee-photos' and public.is_approved() and split_part(name,'/',1)=auth.uid()::text);
create policy attendee_photo_upload on storage.objects for insert to authenticated
with check(bucket_id='attendee-photos' and public.is_approved() and split_part(name,'/',1)=auth.uid()::text);
create policy attendee_photo_delete on storage.objects for delete to authenticated
using(bucket_id='attendee-photos' and public.is_approved() and split_part(name,'/',1)=auth.uid()::text);
create policy attendee_photo_no_overwrite on storage.objects as restrictive for update to authenticated
using(bucket_id<>'attendee-photos') with check(bucket_id<>'attendee-photos');
-- Never remove a currently referenced picture, including a concurrent re-attachment.
create policy attendee_photo_reference_guard on storage.objects as restrictive for delete to authenticated
using(bucket_id<>'attendee-photos' or not exists(select 1 from public.attendee_photos p where p.account_id=auth.uid() and p.object_path=name));
create function public.load_attendee_photos() returns jsonb language plpgsql security definer set search_path=public as $$ begin
 if not public.is_approved() then raise exception 'APPROVAL_REQUIRED';end if;
 return jsonb_build_object('revision',(select revision from public.account_state where account_id=auth.uid()),
 'enabled',coalesce((select enabled from public.account_photo_settings where account_id=auth.uid()),false),
 'photos',coalesce((select jsonb_agg(jsonb_build_object('attendeeId',attendee_id,'path',object_path) order by attendee_id) from public.attendee_photos where account_id=auth.uid()),'[]'::jsonb));
end $$;
create function public.set_attendee_photos_enabled(account uuid,expected bigint,value boolean) returns jsonb language plpgsql security definer set search_path=public as $$
declare rev bigint;begin
 if account is distinct from auth.uid() or not public.is_approved() then raise exception 'APPROVAL_REQUIRED';end if;
 select revision into rev from public.account_state where account_id=auth.uid() for update;
 if rev is null or expected is null or rev<>expected then raise exception 'VERSION_CONFLICT';end if;
 if value is null then raise exception 'INVALID_DATA';end if;
 insert into public.account_photo_settings(account_id,enabled) values(auth.uid(),value) on conflict(account_id) do update set enabled=excluded.enabled;
 update public.account_state set revision=revision+1 where account_id=auth.uid();
 return public.load_attendee_photos();
end $$;
create function public.save_attendee_photo(account uuid,expected bigint,person text,object_path text) returns jsonb language plpgsql security definer set search_path=public as $$
declare rev bigint;previous text;begin
 if account is distinct from auth.uid() or not public.is_approved() then raise exception 'APPROVAL_REQUIRED';end if;
 select revision into rev from public.account_state where account_id=auth.uid() for update;
 if rev is null or expected is null or rev<>expected then raise exception 'VERSION_CONFLICT';end if;
 if not exists(select 1 from public.attendees where account_id=auth.uid() and id=person) then raise exception 'INVALID_ATTENDEE';end if;
 select p.object_path into previous from public.attendee_photos p where p.account_id=auth.uid() and p.attendee_id=person;
 if object_path is null then
 delete from public.attendee_photos p where p.account_id=auth.uid() and p.attendee_id=person;
 else
 if split_part(object_path,'/',1)<>auth.uid()::text or split_part(object_path,'/',2)<>person
 or array_length(string_to_array(object_path,'/'),1)<>3
 or split_part(object_path,'/',3) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
 or not exists(select 1 from storage.objects o where o.bucket_id='attendee-photos' and o.name=object_path
 and o.metadata->>'mimetype'='image/jpeg' and (o.metadata->>'size')::bigint between 1 and 102400) then raise exception 'INVALID_PHOTO';end if;
 insert into public.attendee_photos(account_id,attendee_id,object_path) values(auth.uid(),person,object_path)
 on conflict(account_id,attendee_id) do update set object_path=excluded.object_path;
 end if;
 update public.account_state set revision=revision+1 where account_id=auth.uid();
 return public.load_attendee_photos()||jsonb_build_object('oldPath',previous);
end $$;
-- Aged unreferenced files include abandoned uploads and attendee/reset deletions.
-- Only list metadata here. Delete actual files through Storage API, never SQL DELETE.
create function public.list_attendee_photo_orphans() returns jsonb language plpgsql security definer set search_path=public as $$ begin
 if not public.is_approved() then raise exception 'APPROVAL_REQUIRED';end if;
 return coalesce((select jsonb_agg(x.name) from(select o.name from storage.objects o
 where o.bucket_id='attendee-photos' and split_part(o.name,'/',1)=auth.uid()::text
 and o.created_at<now()-interval '1 hour'
 and not exists(select 1 from public.attendee_photos p where p.account_id=auth.uid() and p.object_path=o.name)
 order by o.created_at limit 100)x),'[]'::jsonb);
end $$;
-- Preserve the catalog RPC and make full reset also reset the photo preference atomically.
alter function public.save_state(date,bigint,jsonb,text) rename to save_catalog_state;
revoke all on function public.save_catalog_state(date,bigint,jsonb,text) from public,anon,authenticated;
create function public.save_state(day date,expected bigint,body jsonb,action text default 'save') returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;begin
 result:=public.save_catalog_state(day,expected,body,action);
 if action='reset' then delete from public.account_photo_settings where account_id=auth.uid();end if;
 return result;
end $$;
revoke all on function public.load_attendee_photos(),public.set_attendee_photos_enabled(uuid,bigint,boolean),public.save_attendee_photo(uuid,bigint,text,text),public.list_attendee_photo_orphans(),public.save_state(date,bigint,jsonb,text) from public,anon,authenticated;
grant execute on function public.load_attendee_photos(),public.set_attendee_photos_enabled(uuid,bigint,boolean),public.save_attendee_photo(uuid,bigint,text,text),public.list_attendee_photo_orphans(),public.save_state(date,bigint,jsonb,text) to authenticated;
commit;

