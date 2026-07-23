create or replace function public.push_sync_snapshot(
  p_name text,
  p_payload jsonb,
  p_expected_revision bigint
)
returns table(applied boolean, next_revision bigint, server_updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  update public.sync_snapshots
  set payload = p_payload,
      revision = revision + 1,
      updated_at = now()
  where user_id = current_user_id
    and name = p_name
    and revision = p_expected_revision
  returning true, revision, updated_at
  into applied, next_revision, server_updated_at;

  if found then
    return next;
    return;
  end if;

  if p_expected_revision = 0 then
    insert into public.sync_snapshots (user_id, name, payload, revision, updated_at)
    values (current_user_id, p_name, p_payload, 1, now())
    on conflict (user_id, name) do nothing
    returning true, revision, updated_at
    into applied, next_revision, server_updated_at;

    if found then
      return next;
      return;
    end if;
  end if;

  select false, snapshot.revision, snapshot.updated_at
  into applied, next_revision, server_updated_at
  from public.sync_snapshots as snapshot
  where snapshot.user_id = current_user_id
    and snapshot.name = p_name;
  return next;
end;
$$;

revoke insert, update, delete on public.sync_snapshots from anon, authenticated;
grant select on public.sync_snapshots to authenticated;

revoke all on function public.push_sync_snapshot(text, jsonb, bigint) from public;
grant execute on function public.push_sync_snapshot(text, jsonb, bigint) to authenticated;
