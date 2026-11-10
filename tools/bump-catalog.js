// Marks the catalogue as changed so every visitor fetches it fresh once.
// Run after editing products or sections outside the admin page (scripts, Firebase console).
// Usage: node tools/bump-catalog.js harshpurohit117@gmail.com
const path = require('path');
const lib = path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'firebase-tools', 'lib');
const auth = require(path.join(lib, 'auth.js'));

(async () => {
  const acct = auth.findAccountByEmail(process.argv[2]);
  if (!acct) throw new Error('No Firebase CLI login for ' + process.argv[2]);
  const tok = (await auth.getAccessToken(acct.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform'])).access_token;
  const url = 'https://firestore.googleapis.com/v1/projects/crochetlandingpage/databases/(default)/documents/meta/catalog?updateMask.fieldPaths=version';
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { version: { timestampValue: new Date().toISOString() } } })
  });
  const j = await res.json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  console.log('catalogue version', j.fields.version.timestampValue);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
