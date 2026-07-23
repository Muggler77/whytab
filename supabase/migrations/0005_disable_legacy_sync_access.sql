-- Apply to the hosted project only after every official 0.5.2 client is live.
-- RLS remains enabled; this removes the temporary compatibility path used by
-- 0.5.1 and requires all writes to use the revision-checked RPC.
revoke insert, update, delete on public.sync_snapshots from anon, authenticated;
grant select on public.sync_snapshots to authenticated;
