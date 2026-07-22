# whytab Auth Email Delivery

whytab uses Supabase Auth for email and password accounts. Public signup should not rely on Supabase's default email sender because it is intended for testing and has strict delivery limits.

Production email delivery can be configured in either of these ways:

1. Supabase Custom SMTP
2. Supabase Send Email Hook with a provider such as Resend

## Temporary Free Hosting Path

The public web app currently uses:

- Web app: `https://whytab.pages.dev/`
- Email provider: Supabase built-in Auth sender
- Custom SMTP: disabled until an owned domain is available
- Send Email Hook: disabled until an owned sender domain is available

`pages.dev` is a shared Cloudflare domain. A Pages project can use it for hosting and Auth redirects, but it cannot create DNS records for `no-reply@whytab.pages.dev`. Supabase's built-in sender is therefore suitable only as a temporary low-volume path.

Configure Supabase Auth URL settings as follows:

```txt
Site URL: https://whytab.pages.dev/
Additional Redirect URL: https://whytab.pages.dev/
```

When an owned domain is purchased, configure Resend or another provider with DKIM, SPF, return-path, and DMARC records, then enable Supabase Custom SMTP.

After Custom SMTP is enabled, paste the branded confirmation template from:

```txt
docs/supabase-confirm-signup-email.html
```

Use this subject:

```txt
确认你的 whytab 同步账号
```

## Optional Send Email Hook

The repository also includes a ready-to-deploy Send Email Hook at:

```txt
supabase/functions/send-auth-email/index.ts
```

Required Supabase Edge Function secrets:

```txt
RESEND_API_KEY
SEND_EMAIL_HOOK_SECRET
AUTH_EMAIL_FROM
AUTH_EMAIL_PUBLIC_APP_URL
```

Example values after an owned email domain is available:

```txt
AUTH_EMAIL_FROM=whytab <no-reply@YOUR_DOMAIN>
AUTH_EMAIL_PUBLIC_APP_URL=https://YOUR_DOMAIN/
```

Do not commit these values. Set them only in Supabase Secrets.

Deploy the function after the email provider and verified sender are ready:

```sh
supabase functions deploy send-auth-email --no-verify-jwt
```

Then enable the Supabase Auth "Send Email" hook and point it to the deployed function URL. With the hook enabled, Supabase delegates Auth email delivery to the hook instead of using the built-in SMTP sender.
