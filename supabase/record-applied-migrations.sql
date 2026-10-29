-- Only after 001 through 004 have been applied successfully in SQL Editor.
-- Records existing schema in the standard Supabase migration history so GitHub
-- integration/CLI will not attempt to create the same tables again.
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text not null primary key,
  statements text[],
  name text
);
alter table supabase_migrations.schema_migrations enable row level security;
insert into supabase_migrations.schema_migrations(version,name)
values ('001','orderpick'),('002','guest_access_admin_login'),('003','fix_save_alias'),('004','safe_delete_predicates')
on conflict(version) do nothing;
select version,name from supabase_migrations.schema_migrations order by version;
