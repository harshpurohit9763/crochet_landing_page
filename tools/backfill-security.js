// One-off data fix for the tighter security rules (Nov 2026). Dry run unless --apply is passed.
//  1. orders: adds productIds (the products in the order) so customers can still review old delivered orders.
//  2. users:  strips spaces, dashes and brackets from phone numbers, which the rules now require to be digits.
// It only adds or rewrites those two fields; nothing is deleted.
// Usage: node tools/backfill-security.js <cli-login-email> [--apply]
//        FIREBASE_ENV=prod node tools/backfill-security.js <cli-login-email> [--apply]
const path = require('path');
const lib = path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'firebase-tools', 'lib');
const auth = require(path.join(lib, 'auth.js'));
const { PROJECT } = require('./env');

const BASE = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents';

function productIdsOf(items) {
  const ids = new Set();
  ((items && items.arrayValue && items.arrayValue.values) || []).forEach((v) => {
    const key = (((v.mapValue || {}).fields || {}).id || {}).stringValue || '';
    if (key && !key.startsWith('combo:')) ids.add(key.split('~')[0]);
  });
  return [...ids];
}

(async () => {
  const [cliEmail, flag] = process.argv.slice(2);
  const apply = flag === '--apply';
  const acct = auth.findAccountByEmail(cliEmail || '');
  if (!acct) throw new Error('Usage: node tools/backfill-security.js <cli-login-email> [--apply]');
  const tok = (await auth.getAccessToken(acct.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform'])).access_token;
  const headers = { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' };

  async function all(col) {
    const out = [];
    let page = '';
    do {
      const r = await (await fetch(BASE + '/' + col + '?pageSize=300' + (page ? '&pageToken=' + page : ''), { headers })).json();
      if (r.error) throw new Error(JSON.stringify(r.error));
      out.push(...(r.documents || []));
      page = r.nextPageToken || '';
    } while (page);
    return out;
  }
  async function patch(name, fields) {
    const mask = Object.keys(fields).map((k) => 'updateMask.fieldPaths=' + k).join('&');
    const r = await fetch('https://firestore.googleapis.com/v1/' + name + '?' + mask + '&currentDocument.exists=true', {
      method: 'PATCH', headers, body: JSON.stringify({ fields })
    });
    if (!r.ok) throw new Error(await r.text());
  }

  const orders = await all('orders');
  const needIds = orders.filter((d) => !(d.fields && d.fields.productIds));
  console.log('orders:', orders.length, 'total,', needIds.length, 'without productIds');

  const users = await all('users');
  const phoneFix = [], phoneBad = [];
  users.forEach((d) => {
    const phone = ((d.fields || {}).phone || {}).stringValue;
    if (phone == null || /^\+?\d{10,15}$/.test(phone)) return;
    const clean = phone.replace(/[\s()-]/g, '');
    if (/^\+?\d{10,15}$/.test(clean)) phoneFix.push([d, clean]); else phoneBad.push(d);
  });
  console.log('users:', users.length, 'total,', phoneFix.length, 'phone numbers to tidy,', phoneBad.length, 'that need the customer to re-enter them');

  if (!apply) { console.log('Dry run. Nothing written. Add --apply to write.'); return; }
  for (const d of needIds) {
    await patch(d.name, { productIds: { arrayValue: { values: productIdsOf(d.fields.items).map((s) => ({ stringValue: s })) } } });
  }
  for (const [d, clean] of phoneFix) await patch(d.name, { phone: { stringValue: clean } });
  console.log('done:', needIds.length, 'orders and', phoneFix.length, 'phone numbers updated');
})().catch((e) => { console.error(e.message); process.exit(1); });
