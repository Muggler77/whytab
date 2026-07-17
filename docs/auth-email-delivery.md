# whytab Auth Email Delivery

whytab uses Supabase Auth for email and password accounts. Public signup should not rely on Supabase's default email sender because it is intended for testing and has strict delivery limits.

Production email delivery can be configured in either of these ways:

1. Supabase Custom SMTP
2. Supabase Send Email Hook with a provider such as Resend

## Chosen Production Path

For the public whytab launch, use:

- Email provider: Resend Free
- Domain target: `why-tool.com`
- Sender target: `WhyTab <no-reply@why-tool.com>`
- Supabase integration: Custom SMTP

Resend Free currently fits early public signup because it includes a free monthly quota, a daily sending limit, and one custom domain. Add the Resend DKIM, return-path/SPF, and DMARC records in Cloudflare DNS for `why-tool.com`, then wait until Resend marks the domain as verified.

Supabase Auth SMTP settings:

```txt
Sender email address: no-reply@why-tool.com
Sender name: WhyTab
Host: smtp.resend.com
Port number: 465
Minimum interval per user: 60
Username: resend
Password: Resend API key scoped to sending access for why-tool.com
```

Do not commit the Resend API key. Store it only in Supabase's encrypted Custom SMTP password field.

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

Recommended values:

```txt
AUTH_EMAIL_FROM=whytab <no-reply@why-tool.com>
AUTH_EMAIL_PUBLIC_APP_URL=https://why-tool.com/
```

Do not commit these values. Set them only in Supabase Secrets.

Deploy the function after the email provider and verified sender are ready:

```sh
supabase functions deploy send-auth-email --no-verify-jwt
```

Then enable the Supabase Auth "Send Email" hook and point it to the deployed function URL. With the hook enabled, Supabase delegates Auth email delivery to the hook instead of using the built-in SMTP sender.
