# whytab

whytab is a local-first new tab dashboard for shortcuts, widgets, notes, todos, weather, exchange rates, and optional cross-device sync.

It is built as a Chrome / Edge Manifest V3 extension and as a responsive web app for mobile and tablet use. The core idea is simple: user data should work locally first, remain exportable, and only sync to the cloud after the user signs in.

## Highlights

- Local-first data: shortcuts, widgets, todos, notes, countdowns, settings, and layout are stored in the browser's IndexedDB.
- Optional cloud sync: users can register or sign in with email and password to sync across devices.
- User data isolation: cloud data is protected by Supabase Auth and Row Level Security.
- Cross-platform usage: works on macOS, Windows, iOS, iPadOS, Android, and other modern browsers depending on extension/PWA support.
- Import and backup: supports JSON, browser bookmarks HTML, CSV, and Wetab migration input.
- Private by default on each device: the app remains usable offline and does not require sign-in for local use.

## Supported Platforms

### Desktop

- macOS with Chrome or Edge
- Windows with Chrome or Edge
- Linux with Chromium-based browsers

### Mobile and Tablet

- iPhone and iPad through Safari Web App / Add to Home Screen
- Android through Chrome or other modern browsers as a web app
- Tablet layouts with touch-friendly navigation and safe-area support

The browser extension replaces the new tab page where the browser supports `chrome_url_overrides.newtab`. On mobile systems that do not support that extension API, whytab can still run as a web app.

## Features

### Shortcuts

- Website shortcut grid
- Groups and folders
- Dock-pinned shortcuts
- Add, edit, delete, and reorder shortcuts
- Automatic favicon matching
- Custom icon URL and icon color
- Search/filter shortcuts
- Import from Wetab, bookmarks, CSV, or whytab JSON

### Widgets

- Weather
- Calendar
- Countdown dates
- To Do
- Notes
- Exchange rates
- World clock
- Year progress
- Calculator
- Photo widget

### Appearance

- Dark and light themes
- Built-in wallpapers
- Custom wallpaper upload
- Daily wallpaper rotation
- Glass intensity
- Icon size
- Grid density
- Dock position
- Mobile bottom navigation
- Phone single-column and tablet two-column widget layouts

### Sync and Backup

- Email/password registration and login
- Automatic sync after sign-in
- Manual merge sync
- Local overwrite cloud
- Cloud overwrite local
- Local rollback point before overwrite operations
- JSON export/import backup

## Data Safety

User data safety is a core design point.

- Without login, data stays in the current browser profile through IndexedDB.
- After login, data is synced to Supabase under the signed-in user's `auth.uid()`.
- Row Level Security policies restrict each user to their own rows.
- The repository does not include Supabase `service_role` keys, database passwords, GitHub tokens, SSH private keys, production service URLs, or personal exported user data.
- Frontend sync configuration is injected at build time through environment variables.

More details: [Privacy and Security](docs/privacy-and-security.md).

## Tech Stack

- React 18
- TypeScript
- Vite
- Chrome Extension Manifest V3
- lucide-react
- IndexedDB
- Supabase Auth
- Supabase Postgres
- Supabase Edge Functions
- Open-Meteo weather data
- npm workspaces

## Project Structure

```text
.
├── extension
│   ├── public
│   │   ├── manifest.json        # Chrome / Edge extension manifest
│   │   ├── app.webmanifest      # PWA manifest
│   │   ├── sw.js                # Service worker for web app usage
│   │   ├── icons                # Extension icons
│   │   └── wallpapers           # Built-in wallpapers
│   ├── src
│   │   ├── App.tsx              # Main UI and dialogs
│   │   ├── styles.css           # Global and responsive styles
│   │   ├── db.ts                # IndexedDB persistence
│   │   ├── sync.ts              # Auth and sync helpers
│   │   ├── importers.ts         # Import parsing and icon matching
│   │   ├── weather.ts           # Weather data
│   │   ├── rates.ts             # Exchange-rate data
│   │   ├── defaultState.ts      # Default local state
│   │   ├── projectConfig.ts     # Build-time sync config reader
│   │   └── types.ts             # Core types
│   └── dist                     # Build output
├── supabase
│   ├── migrations               # Database schema and RLS policies
│   └── functions                # Edge Functions
├── tools                        # Migration helpers
└── docs                         # Documentation
```

## Quick Start

Install dependencies:

```bash
npm install
```

Type check:

```bash
npm run typecheck
```

Build:

```bash
npm run build
```

Load the extension build directory in Chrome or Edge:

```text
extension/dist
```

## Chrome Installation

1. Open `chrome://extensions/`.
2. Enable Developer mode.
3. Click "Load unpacked".
4. Select `extension/dist`.
5. Open a new tab.

## Edge Installation

1. Open `edge://extensions/`.
2. Enable Developer mode.
3. Click "Load unpacked".
4. Select `extension/dist`.

## Mobile and Tablet Web App

The same frontend can be deployed to GitHub Pages or any static hosting provider. On iPhone and iPad, open the deployed URL in Safari and use "Add to Home Screen". On Android, use the browser's install/add-to-home-screen option.

After signing in with the same account, mobile and desktop clients can merge shortcuts, widgets, notes, todos, and settings.

## Cloud Sync

The hosted sync backend uses Supabase:

- Supabase Auth for email/password accounts
- `sync_snapshots` for current full-state sync
- Row Level Security to isolate per-user data
- An Edge Function for cached Bank of China exchange-rate data

Public users do not need to enter service URLs or API keys. The hosted build injects frontend sync configuration during build. If you fork and self-host, configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then run the migration in `supabase/migrations/0001_init_whytab.sql`.

## Import and Backup

Supported import formats:

- whytab JSON
- Browser bookmarks HTML
- CSV
- Wetab page capture output

Use "Export" after setting up your dashboard to keep an offline JSON backup. Cloud sync is useful for multiple devices, but local export remains the easiest recovery path after browser resets or migrations.

## Common Commands

```bash
npm install
npm run typecheck
npm run build
npm run dev
npm run preview
```

## Public Repository Safety Checklist

Before making this repository public, the following checks are expected:

- No personal shortcut export files are tracked.
- No Supabase `service_role` key is tracked.
- No database password, GitHub token, or SSH private key is tracked.
- Public Supabase publishable key is injected only at build time.
- RLS policies are present for user-owned tables.
- The app remains usable without login through local IndexedDB.

## Documentation

- [Installation](docs/install.md)
- [Data model](docs/data-model.md)
- [Privacy and Security](docs/privacy-and-security.md)
- [Configuration and operations](docs/whytab-configuration-and-usage.md)
