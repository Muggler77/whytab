# whytab Configuration and Operations

This document describes how to configure and operate whytab without exposing private credentials or user data.

## Local-First Behavior

whytab stores user data in the browser profile first:

- Shortcuts
- Groups and folders
- Dock pins
- Widgets
- Todos
- Notes
- Countdowns
- Appearance settings
- Sync metadata

The app works without login. Signing in only enables cross-device sync.

## Sync Configuration

The app does not expose service URL or API key fields in the user interface.

Frontend sync configuration is injected at build time:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

For local development, create an ignored `.env.local` file from `.env.example`.

For GitHub Pages, configure repository secrets with the same names:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Do not commit real values to source control.

## Secret Handling Rules

Never commit:

- Supabase `service_role` key
- Database password
- GitHub token
- SSH private key
- Personal exported shortcut data
- Browser profile data
- Local `.env` or `.env.local` files

The frontend publishable key is not an administrator key, but it is still treated as build-time configuration so the public source code does not expose a specific production project.

## Supabase Tables

The migration creates these tables:

- `shortcut_groups`
- `shortcuts`
- `widgets`
- `todos`
- `notes`
- `countdowns`
- `settings`
- `sync_snapshots`
- `exchange_rate_cache`

User-owned tables have Row Level Security enabled. Each policy checks:

```sql
auth.uid() = user_id
```

This ensures signed-in users can only read and write their own rows.

## Current Sync Model

Current app versions use `sync_snapshots` for full-state sync. The migration also includes finer-grained tables so future versions can move toward per-record sync.

Sync actions:

- Automatic pull after login
- Automatic push after local edits
- Manual merge sync
- Local overwrite cloud
- Cloud overwrite local
- Local rollback point before overwrite operations

Deletion and conflict handling:

- Deleted records use `deletedAt` markers to avoid old devices restoring removed data.
- Same-record conflicts prefer the newer `updatedAt`.
- Notes can preserve conflict text when two devices edit different content.

## Extension Installation

Build:

```bash
npm install
npm run build
```

Load this directory in Chrome or Edge:

```text
extension/dist
```

## Web App Deployment

The same build can be deployed as a static web app.

For GitHub Pages, the workflow reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from GitHub Actions secrets during build.

## Public Release Checklist

Before making the repository public:

1. Run a repository scan for private project IDs, tokens, SSH paths, personal emails, and exported user data.
2. Verify no `.env` files are tracked.
3. Verify no personal migration JSON files are tracked.
4. Verify Git history has been cleaned or replaced with a clean public history.
5. Run `npm run typecheck`.
6. Run `npm run build`.
7. Confirm RLS policies remain in `supabase/migrations/0001_init_whytab.sql`.
