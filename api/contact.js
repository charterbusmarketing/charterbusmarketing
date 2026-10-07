// Vercel serverless function: emails website form submissions via Resend.
// Needs env var RESEND_API_KEY. Optional: MAIL_TO, MAIL_FROM.
const TO = process.env.MAIL_TO || 'hello@charterbusmarketing.com';
const FROM = process.env.MAIL_FROM || 'Charter Bus Marketing <forms@charterbusmarketing.com>';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  // Honeypot: bots fill the hidden field; pretend success.
  if (body.website_url) return res.status(200).json({ ok: true });

  const fields = body.fields && typeof body.fields === 'object' ? body.fields : {};
  const clean = {};
  for (const [k, v] of Object.entries(fields).slice(0, 20)) clean[String(k).slice(0, 60)] = String(v ?? '').slice(0, 2000).trim();

  const email = clean['Email'] || '';
  const name = clean['Name'] || '';
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'Name and a valid email are required.' });
  }
  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ ok: false, error: 'Email is not configured yet.' });
  }

  const formName = String(body.form || 'Website form').slice(0, 80);
  const company = clean['Company'] || clean['Website'] || '';
  const subject = `New audit request: ${name}${company ? ' — ' + company : ''}`;

  const linkify = (k, v) => {
    if (!v) return '—';
    if (k === 'Email') return `<a href="mailto:${esc(v)}" style="color:#b2622d">${esc(v)}</a>`;
    if (k === 'Phone') return `<a href="tel:${esc(v.replace(/[^\d+]/g, ''))}" style="color:#b2622d">${esc(v)}</a>`;
    if (k === 'Website') { const u = /^https?:\/\//i.test(v) ? v : 'https://' + v; return `<a href="${esc(u)}" style="color:#b2622d">${esc(v)}</a>`; }
    return esc(v);
  };
  const rows = Object.entries(clean);
  const html =
    '<div style="background:#f5ead8;padding:32px 12px;font-family:Arial,Helvetica,sans-serif">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px">' +
    `<tr><td style="padding:28px 32px 6px"><div style="font-size:22px;font-weight:bold;color:#2b2118">New audit request</div>` +
    `<div style="font-size:14px;color:#6b5d4f;margin-top:6px">${esc(formName)} · charterbusmarketing.com</div></td></tr>` +
    '<tr><td style="padding:14px 32px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px">' +
    rows.map(([k, v]) => `<tr><td style="padding:10px 16px 10px 0;color:#6b5d4f;vertical-align:top;width:40%;border-bottom:1px solid #eee">${esc(k)}</td>` +
      `<td style="padding:10px 0;color:#2b2118;font-weight:bold;vertical-align:top;border-bottom:1px solid #eee">${linkify(k, v)}</td></tr>`).join('') +
    '</table></td></tr></table>' +
    '<div style="max-width:600px;margin:12px auto 0;font-size:12px;color:#8a7b6b;text-align:center">Reply to this email to answer the prospect directly.</div></div>';
  const text = `New audit request — ${formName}\n\n` + rows.map(([k, v]) => `${k}: ${v || '—'}`).join('\n');

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [TO], reply_to: email, subject, html, text }),
    });
    if (!r.ok) {
      console.error('Resend error', r.status, await r.text());
      return res.status(502).json({ ok: false, error: 'Could not send right now.' });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(502).json({ ok: false, error: 'Could not send right now.' });
  }
};
