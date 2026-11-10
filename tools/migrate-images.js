// Moves product photos that are still files (img/...) into Firestore `media` records,
// then points each product at its record (image: "media:<id>"). Safe to run again:
// products already using media are skipped.
// Usage: node tools/migrate-images.js harshpurohit117@gmail.com
const fs = require('fs');
const path = require('path');
const lib = path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'firebase-tools', 'lib');
const auth = require(path.join(lib, 'auth.js'));

const PROJECT = 'crochetlandingpage';
const ROOT = 'projects/' + PROJECT + '/databases/(default)/documents';
const BASE = 'https://firestore.googleapis.com/v1/' + ROOT;
const SITE = path.join(__dirname, '..');
const MIME = { '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };

(async () => {
  const acct = auth.findAccountByEmail(process.argv[2]);
  if (!acct) throw new Error('No Firebase CLI login for ' + process.argv[2]);
  const tok = (await auth.getAccessToken(acct.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform'])).access_token;
  const headers = { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' };

  const list = await (await fetch(BASE + '/products?pageSize=300', { headers })).json();
  if (list.error) throw new Error(JSON.stringify(list.error));
  let moved = 0, skipped = 0;
  for (const d of list.documents || []) {
    const id = d.name.split('/').pop();
    const image = d.fields.image && d.fields.image.stringValue;
    if (!image || image.startsWith('media:') || image.startsWith('data:')) { skipped++; continue; }
    const file = path.join(SITE, image);
    if (!fs.existsSync(file)) { console.log('MISSING FILE', id, image); continue; }
    const data = 'data:' + (MIME[path.extname(file).toLowerCase()] || 'image/webp') + ';base64,' + fs.readFileSync(file).toString('base64');
    if (data.length >= 1000000) { console.log('TOO BIG', id, image); continue; }
    const mediaId = 'img-' + id;
    const now = new Date().toISOString();
    const res = await fetch(BASE + ':commit', {
      method: 'POST', headers,
      body: JSON.stringify({ writes: [
        { update: { name: ROOT + '/media/' + mediaId, fields: { data: { stringValue: data }, source: { stringValue: image }, createdAt: { timestampValue: now } } } },
        { update: { name: ROOT + '/products/' + id, fields: { image: { stringValue: 'media:' + mediaId }, updatedAt: { timestampValue: now } } },
          updateMask: { fieldPaths: ['image', 'updatedAt'] }, currentDocument: { exists: true } }
      ] })
    });
    if (!res.ok) throw new Error(id + ': ' + await res.text());
    moved++;
    console.log('moved', id, '<-', image, Math.round(data.length / 1024) + ' KB');
  }
  console.log('done: moved', moved, 'already in database', skipped);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
