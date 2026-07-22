import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { Resend } from "npm:resend@4.0.1";

type AuthEmailAction = "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "reauthentication";

type AuthEmailPayload = {
  user: {
    email?: string;
    new_email?: string;
  };
  email_data: {
    token?: string;
    token_hash?: string;
    redirect_to?: string;
    email_action_type: AuthEmailAction;
    site_url?: string;
    token_new?: string;
    token_hash_new?: string;
  };
};

const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
const hookSecret = (Deno.env.get("SEND_EMAIL_HOOK_SECRET") || "").replace(/^v1,whsec_/, "");
const fromAddress = Deno.env.get("AUTH_EMAIL_FROM") || "whytab <no-reply@example.com>";
const publicAppUrl = Deno.env.get("AUTH_EMAIL_PUBLIC_APP_URL") || "https://whytab.pages.dev/";
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const normalizedPublicAppUrl = publicAppUrl.endsWith("/") ? publicAppUrl : `${publicAppUrl}/`;
const publicLogoUrl = `${normalizedPublicAppUrl}icons/icon128.png`;

const resend = resendApiKey ? new Resend(resendApiKey) : undefined;

const subjects: Record<AuthEmailAction, string> = {
  signup: "确认你的 whytab 同步账号",
  invite: "你被邀请使用 whytab",
  magiclink: "登录你的 whytab 账号",
  recovery: "重置你的 whytab 密码",
  email_change: "确认你的 whytab 邮箱变更",
  reauthentication: "确认你的 whytab 操作"
};

function buildVerificationUrl(emailData: AuthEmailPayload["email_data"], tokenHash?: string) {
  if (!supabaseUrl || !tokenHash) return "";

  const url = new URL("/auth/v1/verify", supabaseUrl);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", emailData.email_action_type);
  url.searchParams.set("redirect_to", emailData.redirect_to || publicAppUrl);
  return url.toString();
}

function renderEmail(action: AuthEmailAction, verificationUrl: string, token?: string) {
  const isSignup = action === "signup";
  const title = subjects[action] || "确认你的 whytab 账号";
  const intro = isSignup
    ? "你刚刚使用此邮箱注册了 whytab 同步账号。whytab 会优先把你的快捷方式、小组件、笔记、待办和设置保存在当前浏览器本地。"
    : "你刚刚请求了 whytab 账号相关操作。";
  const nextStep = isSignup ? "完成邮箱验证后，你可以在其他设备登录同一个账号，用于同步自己的 whytab 数据。" : "请确认这是你本人发起的操作，然后继续。";
  const buttonText = isSignup ? "确认邮箱并启用同步" : "确认并继续";

  const fallback = verificationUrl
    ? `<p style="margin:0 0 14px;color:#64748b;font-size:13px;">如果按钮无法打开，请复制以下链接到浏览器地址栏：</p>
       <p style="margin:0 0 18px;word-break:break-all;color:#475569;font-size:12px;">${verificationUrl}</p>`
    : `<p style="margin:0 0 18px;color:#475569;font-size:14px;">验证码：<strong>${token || ""}</strong></p>`;

  const actionBlock = verificationUrl
    ? `<p style="margin:0 0 24px;text-align:center;">
         <a href="${verificationUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:10px;padding:12px 22px;font-size:15px;font-weight:700;">${buttonText}</a>
       </p>`
    : `<p style="margin:0 0 24px;color:#475569;font-size:14px;">请在 whytab 页面中输入上面的验证码。</p>`;

  return {
    subject: title,
    html: `<div style="margin:0;padding:0;background:#f6f8fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,'PingFang SC','Microsoft YaHei',sans-serif;color:#102033;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0;padding:32px 16px;background:#f6f8fb;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e6ebf2;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:30px 32px 18px;text-align:center;">
              <img src="${publicLogoUrl}" width="64" height="64" alt="whytab" style="display:block;margin:0 auto 16px;border-radius:16px;">
              <div style="font-size:22px;font-weight:700;letter-spacing:0;color:#0f172a;">${title}</div>
              <div style="margin-top:8px;font-size:14px;line-height:1.7;color:#64748b;">请完成验证，以保护你的账号安全。</div>
            </td>
          </tr>
          <tr>
            <td style="padding:6px 32px 30px;font-size:15px;line-height:1.8;color:#243449;">
              <p style="margin:0 0 14px;">你好，</p>
              <p style="margin:0 0 14px;">${intro}</p>
              <p style="margin:0 0 22px;">${nextStep}</p>
              ${actionBlock}
              ${fallback}
              <p style="margin:0;color:#64748b;font-size:13px;">如果你没有发起这项操作，可以忽略这封邮件。</p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px;background:#f8fafc;border-top:1px solid #edf2f7;color:#64748b;font-size:12px;line-height:1.7;text-align:center;">
              whytab · local-first new tab dashboard<br>
              <a href="${normalizedPublicAppUrl}" style="color:#0f766e;text-decoration:none;">${normalizedPublicAppUrl}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>`,
    text: `${title}

${intro}

${nextStep}

${verificationUrl || `验证码：${token || ""}`}

如果你没有发起这项操作，可以忽略这封邮件。

whytab
${normalizedPublicAppUrl}`
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("not allowed", { status: 405 });
  if (!resend || !hookSecret) return new Response(JSON.stringify({ error: "email provider is not configured" }), { status: 500 });

  const body = await req.text();
  const headers = Object.fromEntries(req.headers);

  let payload: AuthEmailPayload;
  try {
    payload = new Webhook(hookSecret).verify(body, headers) as AuthEmailPayload;
  } catch {
    return new Response(JSON.stringify({ error: "invalid hook signature" }), { status: 401 });
  }

  const action = payload.email_data.email_action_type;
  const deliveries =
    action === "email_change" && payload.user.email && payload.user.new_email
      ? [
          { to: payload.user.email, tokenHash: payload.email_data.token_hash_new, token: payload.email_data.token },
          { to: payload.user.new_email, tokenHash: payload.email_data.token_hash, token: payload.email_data.token_new || payload.email_data.token }
        ]
      : [{ to: payload.user.email, tokenHash: payload.email_data.token_hash, token: payload.email_data.token }];

  if (deliveries.some((delivery) => !delivery.to)) return new Response(JSON.stringify({ error: "missing recipient" }), { status: 400 });

  for (const delivery of deliveries) {
    const verificationUrl = buildVerificationUrl(payload.email_data, delivery.tokenHash);
    const message = renderEmail(action, verificationUrl, delivery.token);
    const { error } = await resend.emails.send({
      from: fromAddress,
      to: delivery.to,
      subject: message.subject,
      html: message.html,
      text: message.text
    });

    if (error) return new Response(JSON.stringify({ error: error.message || "email provider failed" }), { status: 502 });
  }

  return new Response(JSON.stringify({}), { headers: { "content-type": "application/json" } });
});
