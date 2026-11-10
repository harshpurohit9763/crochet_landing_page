// Catalogue maintenance with the Firebase CLI login. Never overwrites existing documents.
// Usage:
//   node tools/catalog.js <cli-email> restore-banner
//   node tools/catalog.js <cli-email> create-offers
//   node tools/catalog.js <cli-email> list
const path = require('path');
const lib = path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'firebase-tools', 'lib');
const auth = require(path.join(lib, 'auth.js'));

const PROJECT = 'crochetlandingpage';
const ROOT = 'projects/' + PROJECT + '/databases/(default)/documents';
const BASE = 'https://firestore.googleapis.com/v1/' + ROOT;

const SECTIONS = {
  'restore-banner': {
    id: 'festive-banner', title: 'Little loops. Big happiness.',
    subtitle: 'Handmade crochet for every festival, gift and everyday joy.', layout: 'banner', theme: 'festive', order: 60
  },
  'create-offers': {
    id: 'todays-offers', title: "Today's offers",
    subtitle: 'Handpicked deals for a short time. Grab them before the timer runs out.', layout: 'offers', theme: 'deal', order: 5
  }
};

function val(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  return { stringValue: String(v) };
}

(async () => {
  const [email, cmd] = process.argv.slice(2);
  const acct = auth.findAccountByEmail(email);
  if (!acct) throw new Error('No Firebase CLI login for ' + email);
  const tok = (await auth.getAccessToken(acct.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform'])).access_token;
  const headers = { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' };

  if (cmd === 'list') {
    const j = await (await fetch(BASE + '/sections?pageSize=100', { headers })).json();
    (j.documents || []).map((d) => ({
      id: d.name.split('/').pop(), order: +(d.fields.order.integerValue || d.fields.order.doubleValue || 0),
      title: d.fields.title.stringValue, layout: d.fields.layout.stringValue, visible: d.fields.visible ? d.fields.visible.booleanValue : true
    })).sort((a, b) => a.order - b.order).forEach((s) => console.log(s.order, s.id, '|', s.title, '|', s.layout, s.visible ? '' : '(hidden)'));
    return;
  }

  const s = SECTIONS[cmd];
  if (!s) throw new Error('Unknown command ' + cmd);
  const now = new Date();
  const fields = {};
  Object.entries(Object.assign({}, s, { visible: true, createdAt: now, updatedAt: now })).forEach(([k, v]) => { if (k !== 'id') fields[k] = val(v); });
  const res = await fetch(BASE + ':commit', {
    method: 'POST', headers,
    body: JSON.stringify({ writes: [{ update: { name: ROOT + '/sections/' + s.id, fields }, currentDocument: { exists: false } }] })
  });
  const t = await res.text();
  if (res.ok) console.log('created sections/' + s.id);
  else if (t.includes('ALREADY_EXISTS') || t.includes('FAILED_PRECONDITION')) console.log('sections/' + s.id + ' already exists, left as is');
  else throw new Error(t);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
