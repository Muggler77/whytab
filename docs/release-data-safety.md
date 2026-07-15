# whytab Release Data Safety

User data is local-first and must survive extension updates without user action. A release is blocked if any item below fails.

## Required Checks

1. Run the migration safety test:

```sh
node scripts/migration-safety-test.mjs
```

2. Run type checking and production build:

```sh
npm run typecheck
npm run build
```

3. Verify the built `extension/dist/manifest.json` version matches `extension/public/manifest.json`.

4. Verify `extension/dist/latest-version.json` exists and matches the intended published version.

5. Confirm `/Users/muggler/whytab-extension-dist` has been synced from `extension/dist`.

6. Confirm GitHub `main` matches the local NQ790 commit.

## Data Safety Rules

- Never delete or rewrite local user data during an update without first creating a backup.
- Keep `manifest.version`, `APP_VERSION`, and `latest-version.json` aligned for every public release.
- Keep `DATA_SCHEMA_VERSION` separate from app version.
- If a future cloud snapshot has a higher data schema than the current client supports, stop sync and ask the user to upgrade.
- If a migration changes data shape, add a test fixture that proves shortcuts, folders, todos, notes, countdowns, settings, and sync metadata survive.
- If new extension permissions are added, treat the release as higher risk because browser stores may require users to accept the permission before updating.
