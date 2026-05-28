// One-click audiobook-interest opt-in.
// Reader clicks a link in the TGIF newsletter carrying their email via the
// MailerLite {$email} merge tag. We resolve the subscriber and add them to the
// AUDIOBOOK INTEREST group using the dedicated group-assign endpoint (safe for
// existing subscribers regardless of status), falling back to create-with-group
// for an unknown email (e.g. a forwarded newsletter).

const GROUP_ID = '188704677208000051'; // AUDIOBOOK INTEREST
const ML_BASE = 'https://connect.mailerlite.com/api';

const PAGE_CSS = `
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
    background:#0d1f2d;color:#e9eef2;min-height:100vh;display:flex;align-items:center;
    justify-content:center;padding:24px;line-height:1.55}
  .card{max-width:480px;width:100%;text-align:center;background:#13283a;
    border:1px solid #1f3a52;border-radius:14px;padding:48px 36px;
    box-shadow:0 18px 50px rgba(0,0,0,.35)}
  h1{font-size:1.6rem;margin-bottom:14px;letter-spacing:.2px}
  p{color:#aebfcc;font-size:1.02rem;margin-bottom:10px}
  .mark{width:64px;height:64px;border-radius:50%;background:#1f6f4a;display:flex;
    align-items:center;justify-content:center;margin:0 auto 22px;font-size:34px;color:#fff}
  .sig{margin-top:26px;color:#7f93a3;font-size:.92rem;font-style:italic}
  form{margin-top:22px;display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
  input[type=email]{flex:1;min-width:200px;padding:13px 14px;border-radius:9px;
    border:1px solid #2c4a63;background:#0d1f2d;color:#e9eef2;font-size:1rem}
  button{padding:13px 22px;border:none;border-radius:9px;background:#2e8b6b;color:#fff;
    font-size:1rem;font-weight:600;cursor:pointer}
  button:hover{background:#34a07c}
  .logo{height:34px;margin-bottom:26px;opacity:.95}
`;

function page({ title, heading, body, showForm, mark }) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="robots" content="noindex,nofollow">
<title>${title}</title><style>${PAGE_CSS}</style></head>
<body><div class="card">
<img class="logo" src="/images/jack-lively-logo.webp" alt="Jack Lively" onerror="this.style.display='none'">
${mark ? `<div class="mark">${mark}</div>` : ''}
<h1>${heading}</h1>
${body}
${showForm ? `<form method="GET" action="/audiobook">
<input type="email" name="e" placeholder="you@example.com" required>
<button type="submit">Add me</button></form>` : ''}
<div class="sig">Jack Lively</div>
</div></body></html>`;
}

function html(statusCode, markup) {
  return {
    statusCode,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    body: markup
  };
}

function isValidEmail(e) {
  return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && !/[{}$]/.test(e);
}

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const email = (params.e || params.email || '').trim().toLowerCase();

  // Merge tag missing or not interpolated -> show a one-field fallback.
  if (!isValidEmail(email)) {
    return html(200, page({
      title: 'Audiobook list — Jack Lively',
      heading: 'Want Backlash on audio?',
      body: '<p>Pop your email in and I\'ll add you to the audiobook list. You\'ll be the first to know when it\'s ready.</p>',
      showForm: true
    }));
  }

  const apiKey = process.env.MAILERLITE_API_KEY;
  if (!apiKey) {
    console.error('audiobook-optin: MAILERLITE_API_KEY missing');
    return html(200, page({
      title: 'Audiobook list — Jack Lively',
      heading: 'Almost there',
      body: '<p>Something went wrong on my end. Email me at jack@jacklively.com and I\'ll add you by hand.</p>'
    }));
  }
  const auth = { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' };

  try {
    // Resolve the subscriber by email.
    const lookup = await fetch(`${ML_BASE}/subscribers/${encodeURIComponent(email)}`, { headers: auth });

    if (lookup.status === 200) {
      const sub = (await lookup.json()).data;
      const assign = await fetch(`${ML_BASE}/subscribers/${sub.id}/groups/${GROUP_ID}`, {
        method: 'POST', headers: auth
      });
      if (!assign.ok && assign.status !== 200 && assign.status !== 201) {
        console.error('audiobook-optin: assign failed', assign.status, await assign.text());
        throw new Error('assign_failed');
      }
    } else if (lookup.status === 404) {
      // Unknown email (e.g. forwarded newsletter): create + add in one call.
      const create = await fetch(`${ML_BASE}/subscribers`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, groups: [GROUP_ID] })
      });
      if (!create.ok && create.status !== 200 && create.status !== 201) {
        console.error('audiobook-optin: create failed', create.status, await create.text());
        throw new Error('create_failed');
      }
    } else {
      console.error('audiobook-optin: lookup unexpected', lookup.status, await lookup.text());
      throw new Error('lookup_failed');
    }

    return html(200, page({
      title: 'You\'re on the list — Jack Lively',
      heading: 'You\'re on the audiobook list.',
      mark: '&#10003;',
      body: '<p>Thanks. When the Backlash audiobook is ready, you\'ll be among the first to hear about it, and you\'ve helped me decide whether to sell it direct.</p><p>Now go let the dog out.</p>'
    }));
  } catch (err) {
    console.error('audiobook-optin: error', err.message);
    return html(200, page({
      title: 'Audiobook list — Jack Lively',
      heading: 'Almost there',
      body: '<p>I hit a snag adding you automatically. Just reply to the newsletter and I\'ll put you on the list by hand.</p>'
    }));
  }
};
