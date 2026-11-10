// Sets starter prices (Rs 100 to 599) on every product, and optional offers.
// Usage:
//   node tools/set-prices-offers.js <cli-email> prices
//   node tools/set-prices-offers.js <cli-email> offers <hours> id=percent [id=percent ...]
const path = require('path');
const lib = path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'firebase-tools', 'lib');
const auth = require(path.join(lib, 'auth.js'));

const ROOT = 'projects/crochetlandingpage/databases/(default)/documents';
const BASE = 'https://firestore.googleapis.com/v1/' + ROOT;

const PRICES = {
  cherry: 249, daisy: 199, cupcake: 279, sunflower: 229, rose: 249, icecream: 259, bowpink: 199,
  gajra: 349, bow: 149, bluebow: 179, tulipclip: 199, scrunchie: 299,
  rosebangle: 449, sunbangle: 399, earrings: 249, necklace: 499,
  backpack: 599, tote: 549, basket: 499, frock: 599,
  stem: 349, curtain: 399, spiral: 299,
  'f-lotus': 449, 'f-diya': 399, 'f-toran': 599, 'f-bappa1': 549, 'f-tealight': 349, 'f-rose': 499,
  'f-peacock': 199, 'f-bappa2': 549, 'f-bappa3': 549,
  'w-bangle': 449, 'w-gajra': 349, 'w-frock': 599, 'w-bow': 179, 'w-tote': 549, 'w-tulip': 199
};
const fallback = (id) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 1000; return 149 + (h % 5) * 100; };

(async () => {
  const [email, cmd, ...rest] = process.argv.slice(2);
  const acct = auth.findAccountByEmail(email);
  if (!acct) throw new Error('No Firebase CLI login for ' + email);
  const tok = (await auth.getAccessToken(acct.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform'])).access_token;
  const headers = { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' };
  const now = new Date();
  const writes = [];

  if (cmd === 'prices') {
    const list = await (await fetch(BASE + '/products?pageSize=300&mask.fieldPaths=name', { headers })).json();
    for (const d of list.documents || []) {
      const id = d.name.split('/').pop();
      const price = PRICES[id] || fallback(id);
      writes.push({ update: { name: ROOT + '/products/' + id, fields: { price: { integerValue: String(price) }, updatedAt: { timestampValue: now.toISOString() } } },
        updateMask: { fieldPaths: ['price', 'updatedAt'] }, currentDocument: { exists: true } });
      console.log(id, 'Rs', price);
    }
  } else if (cmd === 'offers') {
    const hours = Number(rest.shift());
    const ends = new Date(now.getTime() + hours * 3600000).toISOString();
    for (const pair of rest) {
      const [id, pct] = pair.split('=');
      writes.push({ update: { name: ROOT + '/products/' + id, fields: { offerPercent: { integerValue: String(Number(pct)) }, offerEndsAt: { timestampValue: ends }, updatedAt: { timestampValue: now.toISOString() } } },
        updateMask: { fieldPaths: ['offerPercent', 'offerEndsAt', 'updatedAt'] }, currentDocument: { exists: true } });
      console.log(id, pct + '% off until', ends);
    }
  } else throw new Error('Command must be prices or offers');

  writes.push({ update: { name: ROOT + '/meta/catalog', fields: { version: { timestampValue: now.toISOString() } } }, updateMask: { fieldPaths: ['version'] } });
  const res = await fetch(BASE + ':commit', { method: 'POST', headers, body: JSON.stringify({ writes }) });
  if (!res.ok) throw new Error(await res.text());
  console.log('saved', writes.length - 1, 'products and refreshed the catalogue version');
})().catch((e) => { console.error(e.message || e); process.exit(1); });
