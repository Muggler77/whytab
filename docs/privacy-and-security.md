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

## User Isolation

Cloud data is scoped to the signed-in Supabase user.

The database migration enables Row Level Security for user-owned tables and enforces:

```sql
auth.uid() = user_id
```

That means one user cannot read or write another user's rows through the public client.

## Credentials and Keys

The source code does not store production service URLs or keys directly.

Build-time variables:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

The Supabase publishable key is safe to use in browser clients when RLS is configured correctly, but it is still injected through build configuration so the public repository does not expose a specific deployment.

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
- Local JSON export for user-controlled backups
- No tracked personal migration data

## Limitations

Browser apps cannot fully hide public client configuration from end users after deployment. Any frontend app that talks directly to Supabase must ship a public project URL and publishable key in the built assets.

Security therefore depends on:

- Never exposing `service_role`
- Correct RLS policies
- Least-privilege database access
- Careful handling of exported user data
- Optional Supabase protections such as email confirmation, rate limits, and CAPTCHA

