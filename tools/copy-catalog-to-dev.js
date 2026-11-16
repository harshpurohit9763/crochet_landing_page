// One-way copy of the shop catalogue from PROD into DEV, so local testing has real products.
// Prod is only read. Customer data (users, carts, orders, reviews) is never copied.
// Usage: node tools/copy-catalog-to-dev.js harshpurohit117@gmail.com
const path = require('path');
const lib = path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'firebase-tools', 'lib');
const auth = require(path.join(lib, 'auth.js'));
const { PROJECTS } = require('./env');

const FROM = PROJECTS.prod;
const TO = PROJECTS.dev;
const COLLECTIONS = ['sections', 'products', 'combos', 'media', 'meta'];
const docsUrl = (p) => 'https://firestore.googleapis.com/v1/projects/' + p + '/databases/(default)/documents';

(async () => {
  if (FROM === TO || TO === 'crochetlandingpage') throw new Error('Refusing: target must be the dev project');
  const acct = auth.findAccountByEmail(process.argv[2]);
  if (!acct) throw new Error('No Firebase CLI login for ' + process.argv[2]);
  const tok = (await auth.getAccessToken(acct.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform'])).access_token;
  const headers = { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' };

  for (const col of COLLECTIONS) {
    const docs = [];
    let pageToken = '';
    do {
      const r = await fetch(docsUrl(FROM) + '/' + col + '?pageSize=50' + (pageToken ? '&pageToken=' + pageToken : ''), { headers });
      if (!r.ok) throw new Error('Read ' + col + ': ' + r.status + ' ' + await r.text());
      const j = await r.json();
      docs.push(...(j.documents || []));
      pageToken = j.nextPageToken || '';
    } while (pageToken);

    // Media docs can be close to 1 MB each, so commit them a few at a time.
    const size = col === 'media' ? 4 : 100;
    for (let i = 0; i < docs.length; i += size) {
      const writes = docs.slice(i, i + size).map((d) => ({
        update: { name: d.name.replace('projects/' + FROM + '/', 'projects/' + TO + '/'), fields: d.fields || {} }
      }));
      const r = await fetch(docsUrl(TO).replace('/documents', '/documents:commit'), { method: 'POST', headers, body: JSON.stringify({ writes }) });
      if (!r.ok) throw new Error('Write ' + col + ': ' + r.status + ' ' + await r.text());
    }
    console.log(col + ': ' + docs.length + ' copied');
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
