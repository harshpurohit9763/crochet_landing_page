// One-time copy of the original catalogue into Firestore.
// Uses the Firebase CLI login. Never overwrites: existing documents are skipped.
// Usage: node tools/seed-catalog.js harshpurohit117@gmail.com
const path = require('path');
const lib = path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'firebase-tools', 'lib');
const auth = require(path.join(lib, 'auth.js'));

const PROJECT = 'crochetlandingpage';
const BASE = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents';

const sections = [
  { id: 'keychains', title: 'Keychains', subtitle: 'Little charms for your keys and bags.', layout: 'grid', theme: 'plain' },
  { id: 'hair', title: 'For your hair', subtitle: 'Bows, clips and gajras that stay fresh forever.', layout: 'grid', theme: 'pastel' },
  { id: 'jewellery', title: 'Jewellery', subtitle: 'Bangles, hoops and necklaces you can stack.', layout: 'grid', theme: 'plain' },
  { id: 'bags', title: 'Bags and baby', subtitle: 'Totes, backpacks and a frock for the little one.', layout: 'grid', theme: 'pastel' },
  { id: 'home', title: 'For the home', subtitle: 'Flowers that never need water.', layout: 'grid', theme: 'plain' },
  { id: 'festive-banner', title: 'Little loops. Big happiness.', subtitle: 'Handmade crochet for every festival, gift and everyday joy.', layout: 'banner', theme: 'festive' },
  { id: 'festive', title: 'Dressed for the festival', subtitle: 'Diyas, garlands and torans that never wilt.', layout: 'shelf', theme: 'peacock' },
  { id: 'worn', title: 'Looks better on you', subtitle: 'Pinned in a braid, stacked on a wrist, carried to the market.', layout: 'gallery', theme: 'sunshine' }
];

const P = (id, name, sectionId, image, extra) => Object.assign({ id, name, sectionId, image, price: null, visible: true, featured: false, heroLine: '', heroColor: 'cherry' }, extra || {});
const products = [
  P('cherry', 'Cherry keychain', 'keychains', 'img/product/cherry.webp', { featured: true, heroLine: 'Cherry on top', heroColor: 'cherry' }),
  P('daisy', 'Daisy keychain', 'keychains', 'img/product/daisy.webp', { featured: true, heroLine: 'Oopsie daisy', heroColor: 'forest' }),
  P('cupcake', 'Cupcake keychain', 'keychains', 'img/product/cupcake.webp', { featured: true, heroLine: 'Sweet tooth', heroColor: 'candy' }),
  P('sunflower', 'Sunflower keychain', 'keychains', 'img/product/sunflower.webp', { featured: true, heroLine: 'Hello sunshine', heroColor: 'sunshine' }),
  P('rose', 'Rose keychain', 'keychains', 'img/product/rose.webp', { featured: true, heroLine: 'Rosy days', heroColor: 'rose' }),
  P('icecream', 'Ice cream keychain', 'keychains', 'img/product/icecream.webp'),
  P('bowpink', 'Coral bow keychain', 'keychains', 'img/product/bowpink.webp'),
  P('gajra', 'Jasmine gajra', 'hair', 'img/product/gajra.webp'),
  P('bow', 'Big red bow', 'hair', 'img/product/bow.webp'),
  P('bluebow', 'Blue braid bow', 'hair', 'img/product/bluebow.webp'),
  P('tulipclip', 'Tulip hair clip', 'hair', 'img/product/tulipclip.webp'),
  P('scrunchie', 'Jasmine scrunchie', 'hair', 'img/product/scrunchie.webp'),
  P('rosebangle', 'Rose and moss bangles', 'jewellery', 'img/product/rosebangle.webp'),
  P('sunbangle', 'Sunflower bangles', 'jewellery', 'img/product/sunbangle.webp'),
  P('earrings', 'Pink hoop earrings', 'jewellery', 'img/product/earrings.webp'),
  P('necklace', 'Cowrie shell necklace', 'jewellery', 'img/product/necklace.webp'),
  P('backpack', 'Sunflower backpack', 'bags', 'img/product/backpack.webp'),
  P('tote', 'Tote with flower square', 'bags', 'img/product/tote.webp'),
  P('basket', 'Rope bag with charms', 'bags', 'img/product/basket.webp'),
  P('frock', 'Baby frock', 'bags', 'img/product/frock.webp'),
  P('stem', 'Forever sunflower stem', 'home', 'img/product/stem.webp'),
  P('curtain', 'Sunflower curtain tie', 'home', 'img/product/curtain.webp'),
  P('spiral', 'Indigo spiral hanging', 'home', 'img/product/spiral.webp'),
  P('f-lotus', 'Pink lotus centrepiece', 'festive', 'img/photo/a_lotus.webp'),
  P('f-diya', 'Lotus diya holder', 'festive', 'img/photo/a_diya.webp'),
  P('f-toran', 'Red blossom toran', 'festive', 'img/photo/a_toran.webp'),
  P('f-bappa1', 'Marigold garland for Bappa', 'festive', 'img/photo/a_bappa1.webp'),
  P('f-tealight', 'Water lily tealights', 'festive', 'img/cut/tealight.webp'),
  P('f-rose', 'Rose garlands', 'festive', 'img/photo/a_rose.webp'),
  P('f-peacock', 'Peacock feather hanging', 'festive', 'img/photo/a_peacock.webp'),
  P('f-bappa2', 'Orange blossom mala', 'festive', 'img/photo/a_bappa2.webp'),
  P('f-bappa3', 'Red flower mala', 'festive', 'img/photo/a_bappa3.webp'),
  P('w-bangle', 'Stacked bangles', 'worn', 'img/photo/p_bangle.webp'),
  P('w-gajra', 'Jasmine gajra', 'worn', 'img/photo/p_gajra.webp'),
  P('w-frock', 'Baby frock', 'worn', 'img/photo/p_frock.webp'),
  P('w-bow', 'Blue braid bow', 'worn', 'img/photo/p_bow.webp'),
  P('w-tote', 'Market tote', 'worn', 'img/photo/p_tote.webp'),
  P('w-tulip', 'Tulip clip', 'worn', 'img/photo/p_tulip.webp')
];

function val(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  return { stringValue: String(v) };
}
function fields(o) {
  const f = {};
  Object.keys(o).forEach((k) => { if (k !== 'id') f[k] = val(o[k]); });
  return f;
}

(async () => {
  const email = process.argv[2];
  const acct = auth.findAccountByEmail(email);
  if (!acct) throw new Error('No Firebase CLI login for ' + email);
  const tok = (await auth.getAccessToken(acct.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform'])).access_token;
  const headers = { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' };
  const now = new Date();
  const docs = [];
  sections.forEach((s, i) => docs.push(['sections', s.id, Object.assign({}, s, { order: (i + 1) * 10, visible: true, createdAt: now, updatedAt: now })]));
  const counters = {};
  products.forEach((p) => {
    counters[p.sectionId] = (counters[p.sectionId] || 0) + 10;
    docs.push(['products', p.id, Object.assign({}, p, { order: counters[p.sectionId], createdAt: now, updatedAt: now })]);
  });

  let created = 0, skipped = 0;
  for (const [col, id, data] of docs) {
    const res = await fetch(BASE + ':commit', {
      method: 'POST', headers,
      body: JSON.stringify({ writes: [{ update: { name: 'projects/' + PROJECT + '/databases/(default)/documents/' + col + '/' + id, fields: fields(data) }, currentDocument: { exists: false } }] })
    });
    if (res.ok) created++;
    else {
      const t = await res.text();
      if (t.includes('ALREADY_EXISTS') || t.includes('FAILED_PRECONDITION')) skipped++;
      else throw new Error(col + '/' + id + ': ' + t);
    }
  }
  console.log('created', created, 'skipped (already there)', skipped);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
