# Privacy and Security

whytab is designed around local-first personal data.

## What Stays Local

Without login, user data is stored in the current browser profile through IndexedDB:

- Website shortcuts
- Shortcut groups and folders
- Widget layout
- Todos
- Notes
- Countdowns
- Theme and appearance settings
- Private photo-frame images and custom wallpaper image data
- Uploaded shortcut and folder icon image data
- Local photo filenames
- Local sync metadata

This data is not sent to the sync backend unless the user signs in.

## What Syncs After Login

After login, whytab syncs the app state to Supabase so the same account can be used across desktop, phone, and tablet clients.

Cloud sync includes:

- Shortcuts
- Groups and folders
- Widgets
- Todos
- Notes
- Countdowns
- Settings

Private photo-frame images and filenames, inline wallpaper data, uploaded custom wallpapers, and uploaded shortcut or folder icons are deliberately removed from cloud snapshots. They remain on the device and can be moved through a user-created complete backup.

Cloud snapshots are protected by Auth, RLS, account-scoped restore points, optimistic concurrency, a fixed `primary` snapshot name, and a 2 MB server-side payload boundary. Legacy direct table access is revoked for public clients; writes go through one authenticated atomic RPC. Cloud fields are not end-to-end encrypted, so the hosted database operator can technically access synchronized content. Do not place passwords or highly sensitive secrets in notes or shortcut titles.

## Website Icons

When automatic website icon lookup is enabled, whytab can request icons from the saved website and public favicon providers such as Google, DuckDuckGo, and Simple Icons. Those requests can reveal the requested website hostname to the provider. Resolved icon locations and responses are cached to reduce repeat requests.

Users can disable automatic website icon lookup in Settings. Manually selected local or direct icon images continue to work.

## User Isolation

Cloud data is scoped to the signed-in Supabase user.

The database migration enables Row Level Security for user-owned tables and enforces:

```sql
auth.uid() = user_id
```

That means one user cannot read or write another user's rows through the public client.

## Credentials and Keys

The source code does not store private production secrets directly.

Build-time variables:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

The Supabase publishable key is safe to use in browser clients when RLS is configured correctly. It is not a `service_role` key and cannot bypass Row Level Security. The public whytab hosted app includes the browser-visible configuration needed for normal users to register, sign in, and sync.

Never commit:

- Supabase `service_role` key
- Database password
- GitHub token
- SSH private key
- Personal exported user data
- `.env` or `.env.local`

## Defense Layers

- Local-first storage by default
- No login required for local use
- Hidden service configuration in the user interface
- Build-time environment injection for public config
- Supabase Auth for account identity
- Supabase Row Level Security for cloud data
- Complete local JSON export and restore for user-controlled backups
- Account-scoped restore points and migration backups
- Server-revision conflict detection for multi-device writes
- Account-operation cancellation guards during login, logout, and sync
- Client and server 2 MB cloud snapshot limits
- Read-only snapshot table access with authenticated atomic writes
- Device-local handling for private photos and custom wallpaper data
- Bounded external icon caches and explicit local persistence errors
- CSP, HSTS, frame blocking, and browser permission policy on the hosted app
- No tracked personal migration data

## Limitations

Browser apps cannot fully hide public client configuration from end users after deployment. Any frontend app that talks directly to Supabase must ship a public project URL and publishable key in the built assets.

Security therefore depends on:

- Never exposing `service_role`
- Correct RLS policies
- Least-privilege database access
- Careful handling of exported user data
- Optional Supabase protections such as email confirmation, rate limits, and CAPTCHA
- Protecting exported backup files, because they can contain the user's complete local dashboard state
