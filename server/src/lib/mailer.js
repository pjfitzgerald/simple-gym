// Outbound email via Resend's HTTP API (same setup as the inventory app —
// its production notes say SMTP ports are blocked from some hosts while
// api.resend.com:443 works, so we use the API from the start).
//
// Delivery is best-effort: the account change that triggered the email has
// already been persisted and matters more than the email going out, so
// failures are logged for follow-up, never thrown. With no RESEND_API_KEY
// (dev, or staging before the key is configured) mail is skipped — the auth
// endpoints expose the tokens in their responses there, so flows still work.

const FROM = process.env.MAIL_FROM || 'simple-gym <noreply@optimisedthought.com>';

// Base URL used in emailed links; set per environment in the compose files.
function appUrl() {
  return (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

async function send(to, subject, html) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn(`Mail skipped (no RESEND_API_KEY): "${subject}" to ${to}`);
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    });
    if (!res.ok) {
      console.error(`Email delivery failed: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.error(`Email delivery failed: ${err.message}`);
  }
}

export function sendVerificationEmail(email, token) {
  const url = `${appUrl()}/?verify_token=${encodeURIComponent(token)}`;
  return send(email, 'Verify your simple-gym account', `
    <p>Welcome to simple-gym! Click the link below to verify your email and activate your account.</p>
    <p><a href="${url}">Verify my email</a></p>
    <p>If you didn't create this account, you can ignore this email.</p>
  `);
}

export function sendPasswordResetEmail(email, token, ttlHours) {
  const url = `${appUrl()}/?reset_token=${encodeURIComponent(token)}`;
  return send(email, 'Reset your simple-gym password', `
    <p>Click the link below to choose a new password. It expires in ${ttlHours} hours.</p>
    <p><a href="${url}">Reset my password</a></p>
    <p>If you didn't request this, you can ignore this email.</p>
  `);
}
