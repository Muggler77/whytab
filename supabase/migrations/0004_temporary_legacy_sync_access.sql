-- Keep the currently deployed 0.5.1 web client operational until the 0.5.2
-- Cloudflare Pages bundle is confirmed live. A follow-up migration revokes
-- these direct write grants immediately after deployment.
grant insert, update, delete on public.sync_snapshots to authenticated;
