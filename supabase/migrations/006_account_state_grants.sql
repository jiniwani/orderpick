-- Supabase default privileges may grant new public tables to API roles.
-- RLS already filters account_state; also enforce least privilege explicitly.
begin;
revoke all on public.account_state from public,anon,authenticated;
grant select on public.account_state to authenticated;
commit;
