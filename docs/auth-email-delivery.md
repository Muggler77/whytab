# whytab Auth Email Delivery

whytab uses Supabase Auth for email and password accounts. Public signup should not rely on Supabase's default email sender because it is intended for testing and has strict delivery limits.

Production email delivery can be configured in either of these ways:

1. Supabase Custom SMTP
2. Supabase Send Email Hook with a provider such as Resend

The repository includes a ready-to-deploy Send Email Hook at:

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

Recommended values:

```txt
AUTH_EMAIL_FROM=whytab <no-reply@your-domain.example>
AUTH_EMAIL_PUBLIC_APP_URL=https://muggler77.github.io/whytab/
```

Do not commit these values. Set them only in Supabase Secrets.

Deploy the function after the email provider and verified sender are ready:

```sh
supabase functions deploy send-auth-email --no-verify-jwt
```

Then enable the Supabase Auth "Send Email" hook and point it to the deployed function URL. Keep the email provider enabled; with the hook enabled, Supabase delegates Auth email delivery to the hook instead of using the built-in SMTP sender.

For Custom SMTP instead, configure SMTP host, port, user, password, sender email, and sender name in the Supabase Auth settings. After Custom SMTP is enabled, paste the confirmation template from:

```txt
docs/supabase-confirm-signup-email.html
```
