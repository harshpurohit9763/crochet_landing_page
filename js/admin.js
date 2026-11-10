import {
  db, auth, googleSignIn, getProfile, STATUS, statusLabel, orderCode, fmtDate, THEMES, LAYOUTS, HERO_COLORS, setImage, el,
  fmtPrice, offerInfo, fmtWhen, bumpCatalog
} from './firebase-shared.js?v=17';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  doc, updateDoc, addDoc, deleteDoc, collection, query, orderBy, limit, onSnapshot, serverTimestamp, writeBatch, Timestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const $ = (id) => document.getElementById(id);
let unsubs = [];

/* ---------- access ---------- */

$('a-signin').addEventListener('click', async () => {
  try { await googleSignIn(); } catch (e) { $('a-gate-msg').textContent = "Couldn't sign in. Try again."; }
});
$('a-out').addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, async (u) => {
  unsubs.forEach((f) => f());
  unsubs = [];
  $('a-user').textContent = u ? u.email : '';
  $('a-out').hidden = !u;
  $('a-tabs').hidden = true;
  $('v-orders').hidden = true;
  $('v-catalog').hidden = true;
  $('a-gate').hidden = false;
  if (!u) {
    $('a-gate-msg').textContent = 'Sign in with your admin Google account.';
    $('a-signin').hidden = false;
    return;
  }
  $('a-signin').hidden = true;
  $('a-gate-msg').textContent = 'Checking access…';
  let profile = null;
  try { profile = await getProfile(u.uid); } catch (e) { console.error(e); }
  if (!profile || profile.role !== 'admin') {
    $('a-gate-msg').replaceChildren(
      'This account is not an admin. Save your details on the profile page first, then in the Firebase console open Firestore, users, document ',
      el('code', '', u.uid), ', and set role to admin.');
    return;
  }
  $('a-gate').hidden = true;
  $('a-tabs').hidden = false;
  showTab(location.hash === '#catalogue' ? 'catalog' : 'orders');
  listenOrders();
  listenCatalog();
});

function showTab(which) {
  ['orders', 'catalog'].forEach((t) => {
    $('tab-' + t).setAttribute('aria-selected', t === which);
    $('v-' + t).hidden = t !== which;
  });
  history.replaceState(null, '', which === 'catalog' ? '#catalogue' : '#orders');
}
$('tab-orders').addEventListener('click', () => showTab('orders'));
$('tab-catalog').addEventListener('click', () => showTab('catalog'));

/* ---------- orders ---------- */

let orders = [];
let filter = 'new';
let firstOrders = true;

function listenOrders() {
  firstOrders = true;
  unsubs.push(onSnapshot(query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(300)), (snap) => {
    if (!firstOrders) snap.docChanges().forEach((c) => { if (c.type === 'added') alertNew(c.doc); });
    firstOrders = false;
    orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderOrders();
  }, (e) => { console.error(e); $('a-count').textContent = "Couldn't load orders. Reload the page."; }));
}

function alertNew(d) {
  const o = d.data();
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('New Fingo order ' + orderCode(d.id), {
      body: (o.customer && o.customer.name ? o.customer.name + ': ' : '') + o.items.map((i) => i.qty + ' x ' + i.name).join(', ')
    });
  }
}

const alertsBtn = $('a-alerts');
function syncAlertsBtn() {
  if (!('Notification' in window)) { alertsBtn.hidden = true; return; }
  if (Notification.permission === 'granted') { alertsBtn.textContent = 'New order alerts on'; alertsBtn.disabled = true; }
  if (Notification.permission === 'denied') { alertsBtn.textContent = 'Alerts blocked in browser settings'; alertsBtn.disabled = true; }
}
alertsBtn.addEventListener('click', async () => { await Notification.requestPermission(); syncAlertsBtn(); });
syncAlertsBtn();
$('a-search').addEventListener('input', renderOrders);

function renderOrders() {
  const counts = { all: orders.length };
  STATUS.forEach(([s]) => { counts[s] = 0; });
  orders.forEach((o) => { counts[o.status] = (counts[o.status] || 0) + 1; });
  document.title = counts.new ? '(' + counts.new + ') Fingo admin' : 'Fingo admin';

  const filters = $('a-filters');
  filters.replaceChildren();
  [['all', 'All']].concat(STATUS).forEach(([s, label]) => {
    const b = el('button', 'chip', label + ' (' + (counts[s] || 0) + ')');
    b.type = 'button';
    b.setAttribute('aria-pressed', filter === s);
    b.addEventListener('click', () => { filter = s; renderOrders(); });
    filters.append(b);
  });

  const q = $('a-search').value.trim().toLowerCase();
  const shown = orders.filter((o) => {
    if (filter !== 'all' && o.status !== filter) return false;
    if (!q) return true;
    const c = o.customer || {};
    return [orderCode(o.id), c.name, c.phone, c.email].some((v) => String(v || '').toLowerCase().includes(q));
  });
  $('a-count').textContent = shown.length + (shown.length === 1 ? ' order' : ' orders');
  const list = $('a-list');
  list.replaceChildren();
  if (!shown.length) { list.append(el('p', 'muted', 'No orders here yet.')); return; }
  shown.forEach((o) => list.append(orderCard(o)));
}

function orderCard(o) {
  const c = o.customer || {};
  const li = el('li', 'a-order' + (o.status === 'new' ? ' is-new' : ''));
  const code = orderCode(o.id);
  const who = el('div');
  who.append(el('h3', '', code), el('p', 'muted', fmtDate(o.createdAt)), el('p', '', c.name || ''), el('p', 'a-addr', c.address || ''));
  const contact = el('div', 'a-contact');
  const digits = String(c.phone || '').replace(/\D/g, '');
  if (digits) {
    const tel = el('a', '', 'Call ' + c.phone);
    tel.href = 'tel:' + String(c.phone).replace(/[^\d+]/g, '');
    const wa = el('a', '', 'WhatsApp');
    wa.href = 'https://api.whatsapp.com/send?phone=' + (digits.length === 10 ? '91' + digits : digits) +
      '&text=' + encodeURIComponent('Hi ' + (c.name || '') + ', this is Fingo about your order ' + code + '.');
    wa.target = '_blank';
    wa.rel = 'noopener';
    contact.append(tel, wa);
  }
  if (c.email) {
    const mail = el('a', '', 'Email');
    mail.href = 'mailto:' + c.email + '?subject=' + encodeURIComponent('Your Fingo order ' + code);
    contact.append(mail);
  }
  who.append(contact);

  const what = el('div');
  const ul = el('ul');
  let sum = 0, unpriced = 0;
  (o.items || []).forEach((i) => {
    const li = el('li', '', i.qty + ' x ' + i.name);
    if (i.price) {
      sum += i.price * i.qty;
      li.append(' ', el('span', 'a-item-price', '@ ' + fmtPrice(i.price) + (i.offerPercent ? ' (' + i.offerPercent + '% off ' + fmtPrice(i.originalPrice) + ')' : '')));
    } else unpriced++;
    li.append(el('span', 'a-item-id', 'Product ID: ' + i.id));
    if (i.note) li.append(el('span', 'a-item-note', i.note));
    ul.append(li);
  });
  const hasDelivery = typeof o.deliveryCharge === 'number';
  if (sum) {
    ul.append(el('li', 'a-total-line', 'Items ' + fmtPrice(sum) + (unpriced ? ' plus ' + unpriced + ' unpriced' : '')));
    ul.append(el('li', 'a-total-line', 'Delivery ' + (hasDelivery ? fmtPrice(o.deliveryCharge) : 'not added yet')));
    ul.append(el('li', 'a-total', 'Total ' + fmtPrice(sum + (hasDelivery ? o.deliveryCharge : 0)) + (hasDelivery ? '' : ' + delivery')));
  }
  what.append(el('h3', '', 'Items'), ul);
  if (o.note) what.append(el('p', 'a-note', 'Order note: ' + o.note));

  const dv = el('form', 'a-delivery');
  const dl = el('label', '', 'Delivery charge (₹)');
  const di = el('input');
  di.type = 'number';
  di.min = '0';
  di.step = '1';
  di.inputMode = 'numeric';
  di.placeholder = '60';
  if (hasDelivery) di.value = o.deliveryCharge;
  dl.append(di);
  const db_ = el('button', 'c-btn', hasDelivery ? 'Update' : 'Add');
  db_.type = 'submit';
  const dmsg = el('span', 'a-delivery-msg');
  dv.append(dl, db_, dmsg);
  dv.addEventListener('submit', async (e) => {
    e.preventDefault();
    const raw = di.value.trim();
    const v = raw === '' ? null : Number(raw);
    if (v !== null && !(Number.isInteger(v) && v >= 0 && v <= 10000)) { dmsg.textContent = 'Enter whole rupees, 0 to 10,000.'; dmsg.className = 'a-delivery-msg error'; return; }
    db_.disabled = true;
    try {
      await updateDoc(doc(db, 'orders', o.id), { deliveryCharge: v, updatedAt: serverTimestamp() });
    } catch (err) {
      console.error(err);
      dmsg.textContent = "Couldn't save. Try again.";
      dmsg.className = 'a-delivery-msg error';
    } finally { db_.disabled = false; }
  });
  what.append(dv);

  const st = el('div', 'a-status');
  const label = el('label', '', 'Status');
  const sel = el('select');
  STATUS.forEach(([s, l]) => { const op = el('option', '', l); op.value = s; sel.append(op); });
  sel.value = o.status;
  label.append(sel);
  const err = el('span', 'error');
  sel.addEventListener('change', async () => {
    sel.disabled = true;
    try { await updateDoc(doc(db, 'orders', o.id), { status: sel.value, ['statusTimes.' + sel.value]: serverTimestamp(), updatedAt: serverTimestamp() }); }
    catch (e) { console.error(e); err.textContent = "Couldn't update. Try again."; sel.value = o.status; }
    finally { sel.disabled = false; }
  });
  st.append(el('span', 'pill s-' + o.status, statusLabel(o.status)), label, err);
  li.append(who, what, st);
  return li;
}

/* ---------- catalogue ---------- */

let sections = [];
let products = [];

function listenCatalog() {
  let gotS = false, gotP = false;
  const ready = () => { if (gotS && gotP) renderCatalog(); };
  unsubs.push(onSnapshot(query(collection(db, 'sections'), orderBy('order')), (s) => {
    sections = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    gotS = true; ready();
  }, (e) => console.error(e)));
  unsubs.push(onSnapshot(query(collection(db, 'products'), orderBy('order')), (s) => {
    products = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    gotP = true; ready();
  }, (e) => console.error(e)));
}

const themeOf = (id) => THEMES.find((t) => t.id === id) || THEMES[0];
const layoutOf = (id) => LAYOUTS.find((l) => l.id === id) || LAYOUTS[0];
const inSection = (id) => products.filter((p) => p.sectionId === id).sort((a, b) => (a.order || 0) - (b.order || 0));

function btn(text, cls, onClick, label) {
  const b = el('button', 'c-btn' + (cls ? ' ' + cls : ''), text);
  b.type = 'button';
  if (label) b.setAttribute('aria-label', label);
  b.addEventListener('click', onClick);
  return b;
}

async function swap(col, a, b) {
  if (!a || !b) return;
  const batch = writeBatch(db);
  batch.update(doc(db, col, a.id), { order: b.order || 0, updatedAt: serverTimestamp() });
  batch.update(doc(db, col, b.id), { order: a.order || 0, updatedAt: serverTimestamp() });
  try { await batch.commit(); bumpCatalog(); } catch (e) { console.error(e); alert("Couldn't reorder. Try again."); }
}

function renderCatalog() {
  const root = $('c-sections');
  root.replaceChildren();
  if (!sections.length) root.append(el('p', 'muted', 'No sections yet. Create your first one.'));
  sections.forEach((s, i) => {
    const card = el('article', 'c-sec');
    const top = el('div', 'c-sec-top');
    const sw = el('span', 'c-swatch');
    sw.style.background = themeOf(s.theme).bg;
    sw.title = themeOf(s.theme).label + ' background';
    const name = el('div', 'c-sec-name');
    const items = inSection(s.id);
    const meta = el('div', 'c-meta');
    meta.append(el('span', 'c-tag', layoutOf(s.layout).label.split(' (')[0]), el('span', 'c-tag', themeOf(s.theme).label));
    if (s.layout !== 'banner') meta.append(el('span', 'c-tag', items.length + (items.length === 1 ? ' product' : ' products')));
    if (s.visible === false) meta.append(el('span', 'c-tag off', 'Hidden'));
    name.append(el('h3', '', s.title), meta);

    const actions = el('div', 'c-actions');
    const up = btn('↑', 'c-icon', () => swap('sections', s, sections[i - 1]), 'Move ' + s.title + ' up');
    up.disabled = i === 0;
    const down = btn('↓', 'c-icon', () => swap('sections', s, sections[i + 1]), 'Move ' + s.title + ' down');
    down.disabled = i === sections.length - 1;
    actions.append(up, down, btn('Edit', '', () => openSection(s)));
    if (s.layout !== 'banner') actions.append(btn('Add product', '', () => openProduct(null, s.id)));
    const del = btn('Delete', 'danger', async () => {
      if (!confirm('Delete the section "' + s.title + '"? This cannot be undone.')) return;
      try { await deleteDoc(doc(db, 'sections', s.id)); bumpCatalog(); } catch (e) { console.error(e); alert("Couldn't delete. Try again."); }
    });
    del.disabled = items.length > 0;
    del.title = items.length ? 'Move or delete its products first' : '';
    actions.append(del);
    top.append(sw, name, actions);
    card.append(top);

    const body = el('div', 'c-prods');
    if (s.layout === 'banner') {
      body.append(el('p', 'muted c-empty', 'Shows its title and the first 3 photos of the next section below it.'));
    } else if (s.layout === 'offers') {
      const live = products.filter((p) => offerInfo(p).active);
      body.append(el('p', 'muted c-empty', live.length
        ? 'Showing ' + live.length + (live.length === 1 ? ' product' : ' products') + ' with a running offer: ' + live.map((p) => p.name).join(', ') + ". Turn an offer on from any product's Edit."
        : "Empty right now. Turn on an offer from any product's Edit and it shows here while the offer runs."));
    } else if (!items.length) {
      body.append(el('p', 'muted c-empty', 'No products yet. Hidden sections and empty sections do not show on the shop.'));
    }
    items.forEach((p, j) => {
      const row = el('div', 'c-prod');
      const img = el('img');
      img.alt = '';
      setImage(img, p.image);
      const info = el('div');
      info.append(el('p', 'c-prod-name', p.name));
      const m = el('div', 'c-meta');
      const oi = offerInfo(p);
      m.append(el('span', 'c-tag', p.price ? fmtPrice(p.price) : 'No price'));
      if (oi.active) m.append(el('span', 'c-tag deal', oi.percent + '% off, now ' + fmtPrice(oi.price)), el('span', 'c-tag', 'Ends ' + fmtWhen(oi.endsAt)));
      else if (oi.hasOffer) m.append(el('span', 'c-tag off', 'Offer ended'));
      if (p.featured) m.append(el('span', 'c-tag star', 'Opening banner'));
      if (p.visible === false) m.append(el('span', 'c-tag off', 'Hidden'));
      info.append(m);
      const a = el('div', 'c-actions');
      const pu = btn('↑', 'c-icon', () => swap('products', p, items[j - 1]), 'Move ' + p.name + ' up');
      pu.disabled = j === 0;
      const pd = btn('↓', 'c-icon', () => swap('products', p, items[j + 1]), 'Move ' + p.name + ' down');
      pd.disabled = j === items.length - 1;
      a.append(pu, pd, btn('Edit', '', () => openProduct(p)),
        btn(p.visible === false ? 'Show' : 'Hide', '', () => updateDoc(doc(db, 'products', p.id), { visible: p.visible === false, updatedAt: serverTimestamp() }).then(bumpCatalog).catch((e) => { console.error(e); alert("Couldn't update. Try again."); })),
        btn('Delete', 'danger', async () => {
          if (!confirm('Delete "' + p.name + '"? This cannot be undone. Past orders keep its name.')) return;
          try {
            await deleteDoc(doc(db, 'products', p.id));
            bumpCatalog();
            if (p.image && p.image.startsWith('media:')) await deleteDoc(doc(db, 'media', p.image.slice(6)));
          } catch (e) { console.error(e); alert("Couldn't delete. Try again."); }
        }));
      row.append(img, info, a);
      body.append(row);
    });
    card.append(body);
    root.append(card);
  });
}

/* ---------- section editor ---------- */

const secDlg = $('sec-dlg'), secForm = $('sec-form');
let editingSection = null;
LAYOUTS.forEach((l) => { const o = el('option', '', l.label); o.value = l.id; $('sec-layout').append(o); });
THEMES.forEach((t) => {
  const lab = el('label', 'c-theme');
  lab.style.background = t.bg;
  lab.style.color = t.ink;
  const r = el('input');
  r.type = 'radio';
  r.name = 'theme';
  r.value = t.id;
  lab.append(r, t.label);
  $('sec-themes').append(lab);
});

function openSection(s) {
  editingSection = s || null;
  $('sec-title').textContent = s ? 'Edit section' : 'New section';
  secForm.elements.title.value = s ? s.title : '';
  secForm.elements.subtitle.value = s ? s.subtitle || '' : '';
  secForm.elements.layout.value = s ? s.layout || 'grid' : 'grid';
  secForm.elements.theme.value = s ? s.theme || 'plain' : 'plain';
  secForm.elements.visible.checked = s ? s.visible !== false : true;
  $('sec-err-title').textContent = '';
  $('sec-msg').textContent = '';
  secDlg.showModal();
}
$('c-new-section').addEventListener('click', () => openSection(null));
$('sec-cancel').addEventListener('click', () => secDlg.close());

secForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = secForm.elements.title.value.trim();
  if (!title) { $('sec-err-title').textContent = 'Enter a title.'; secForm.elements.title.focus(); return; }
  const data = {
    title,
    subtitle: secForm.elements.subtitle.value.trim(),
    layout: secForm.elements.layout.value,
    theme: secForm.elements.theme.value || 'plain',
    visible: secForm.elements.visible.checked,
    updatedAt: serverTimestamp()
  };
  const save = $('sec-save');
  save.disabled = true;
  try {
    if (editingSection) await updateDoc(doc(db, 'sections', editingSection.id), data);
    else {
      const max = sections.reduce((m, s) => Math.max(m, s.order || 0), 0);
      await addDoc(collection(db, 'sections'), { ...data, order: max + 10, createdAt: serverTimestamp() });
    }
    bumpCatalog();
    secDlg.close();
  } catch (err) {
    console.error(err);
    $('sec-msg').textContent = "Couldn't save the section. Try again.";
  } finally { save.disabled = false; }
});

/* ---------- product editor ---------- */

const prodDlg = $('prod-dlg'), prodForm = $('prod-form');
let editingProduct = null;
let newPhoto = null;
HERO_COLORS.forEach((c) => { const o = el('option', '', c.label); o.value = c.id; $('prod-color').append(o); });

function fillSections(selected) {
  const sel = $('prod-section');
  sel.replaceChildren();
  sections.filter((s) => s.layout !== 'banner').forEach((s) => {
    const o = el('option', '', s.title);
    o.value = s.id;
    sel.append(o);
  });
  sel.value = selected;
}

function syncHero() { $('prod-hero').hidden = !$('prod-featured').checked; }
$('prod-featured').addEventListener('change', syncHero);

/* offer fields */
const offerFor = $('prod-offer-for');
const DAY = 86400000;
function localInput(ms) {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}
function syncOffer() {
  const on = $('prod-on-offer').checked;
  $('prod-offer').hidden = !on;
  $('prod-until-wrap').hidden = offerFor.value !== 'custom';
  $('prod-err-offer').textContent = '';
  const price = Number(prodForm.elements.price.value);
  const pct = Number(prodForm.elements.offerPercent.value);
  const calc = $('prod-calc');
  calc.replaceChildren();
  if (!on) return;
  if (!(price > 0)) { calc.append('Add a price above to work out the offer.'); return; }
  if (!(pct >= 1 && pct <= 90)) { calc.append('Enter a discount from 1 to 90 percent.'); return; }
  const now = Math.round(price * (100 - pct) / 100);
  calc.append('Customers pay ', el('strong', '', fmtPrice(now)), ' instead of ', el('s', '', fmtPrice(price)), ', saving ' + fmtPrice(price - now) + '.');
  const end = offerEnd();
  if (end) calc.append(el('span', 'c-calc-end', 'Offer ends ' + fmtWhen(end) + '.'));
}
function offerEnd() {
  const v = offerFor.value;
  if (v === 'keep') return editingProduct ? offerInfo(editingProduct).endsAt : null;
  if (v === 'custom') { const t = new Date($('prod-until').value).getTime(); return Number.isFinite(t) ? t : null; }
  return Date.now() + Number(v) * DAY;
}
['prod-on-offer', 'prod-offer-for', 'prod-until'].forEach((id) => $(id).addEventListener('change', syncOffer));
prodForm.elements.offerPercent.addEventListener('input', syncOffer);
prodForm.elements.price.addEventListener('input', syncOffer);

function fillOffer(p) {
  const keep = offerFor.querySelector('[value="keep"]');
  if (keep) keep.remove();
  const o = p ? offerInfo(p) : null;
  $('prod-on-offer').checked = !!(o && o.active);
  prodForm.elements.offerPercent.value = o && o.active ? o.percent : '';
  if (o && o.active) {
    const opt = el('option', '', 'Keep current end (' + fmtWhen(o.endsAt) + ')');
    opt.value = 'keep';
    offerFor.prepend(opt);
    offerFor.value = 'keep';
  } else offerFor.value = '1';
  $('prod-until').value = localInput(Date.now() + 2 * DAY);
  $('prod-until').min = localInput(Date.now());
  syncOffer();
}

function openProduct(p, sectionId) {
  editingProduct = p || null;
  newPhoto = null;
  $('prod-title').textContent = p ? 'Edit product' : 'New product';
  fillSections(p ? p.sectionId : sectionId);
  prodForm.elements.name.value = p ? p.name : '';
  prodForm.elements.price.value = p && p.price ? p.price : '';
  prodForm.elements.visible.checked = p ? p.visible !== false : true;
  prodForm.elements.featured.checked = p ? !!p.featured : false;
  prodForm.elements.heroLine.value = p ? p.heroLine || '' : '';
  prodForm.elements.heroColor.value = p ? p.heroColor || 'cherry' : 'cherry';
  const prev = $('prod-preview');
  prev.removeAttribute('src');
  if (p) setImage(prev, p.image);
  $('prod-file').value = '';
  ['photo', 'name', 'price', 'offer'].forEach((k) => { $('prod-err-' + k).textContent = ''; });
  $('prod-msg').textContent = '';
  syncHero();
  fillOffer(p);
  prodDlg.showModal();
}
$('prod-cancel').addEventListener('click', () => prodDlg.close());

async function compress(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    let max = 1100, q = 0.82;
    for (;;) {
      const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * s);
      c.height = Math.round(img.naturalHeight * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      let data = c.toDataURL('image/webp', q);
      if (!data.startsWith('data:image/webp')) data = c.toDataURL('image/jpeg', q);
      if (data.length < 700000 || max < 500) return data;
      max = Math.round(max * 0.8);
      q = Math.max(0.6, q - 0.08);
    }
  } finally { URL.revokeObjectURL(url); }
}

$('prod-file').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  $('prod-err-photo').textContent = '';
  if (!f) return;
  if (!f.type.startsWith('image/')) { $('prod-err-photo').textContent = 'Choose an image file.'; return; }
  try {
    newPhoto = await compress(f);
    $('prod-preview').src = newPhoto;
  } catch (err) {
    console.error(err);
    newPhoto = null;
    $('prod-err-photo').textContent = "Couldn't read that photo. Try a JPG or PNG.";
  }
});

prodForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = prodForm.elements.name.value.trim();
  const priceRaw = prodForm.elements.price.value.trim();
  const price = priceRaw === '' ? null : Number(priceRaw);
  let bad = false;
  $('prod-err-name').textContent = name ? '' : 'Enter a name.';
  $('prod-err-price').textContent = price === null || (Number.isFinite(price) && price >= 0) ? '' : 'Enter a price in rupees, or leave it empty.';
  $('prod-err-photo').textContent = editingProduct || newPhoto ? '' : 'Choose a photo.';
  if (!name || $('prod-err-price').textContent || $('prod-err-photo').textContent) bad = true;
  if (!prodForm.elements.sectionId.value) { $('prod-msg').textContent = 'Create a section first.'; bad = true; }
  let offer = { offerPercent: null, offerEndsAt: null };
  if ($('prod-on-offer').checked) {
    const pct = Number(prodForm.elements.offerPercent.value);
    const end = offerEnd();
    let err = '';
    if (!(price > 0)) err = 'An offer needs a price. Add the normal price above.';
    else if (!(Number.isInteger(pct) && pct >= 1 && pct <= 90)) err = 'Enter a whole-number discount from 1 to 90 percent.';
    else if (!end || end < Date.now() + 60000) err = 'Pick an end time in the future.';
    $('prod-err-offer').textContent = err;
    if (err) bad = true;
    else offer = { offerPercent: pct, offerEndsAt: Timestamp.fromMillis(end) };
  }
  if (bad) return;

  const save = $('prod-save');
  save.disabled = true;
  save.textContent = 'Saving…';
  try {
    let image = editingProduct ? editingProduct.image : '';
    if (newPhoto) {
      const m = await addDoc(collection(db, 'media'), { data: newPhoto, createdAt: serverTimestamp() });
      image = 'media:' + m.id;
    }
    const sectionId = prodForm.elements.sectionId.value;
    const data = {
      name, price: price === null ? null : Math.round(price), sectionId, image,
      visible: prodForm.elements.visible.checked,
      featured: prodForm.elements.featured.checked,
      heroLine: prodForm.elements.heroLine.value.trim(),
      heroColor: prodForm.elements.heroColor.value,
      ...offer,
      updatedAt: serverTimestamp()
    };
    const nextOrder = inSection(sectionId).reduce((m, x) => Math.max(m, x.order || 0), 0) + 10;
    if (editingProduct) {
      if (editingProduct.sectionId !== sectionId) data.order = nextOrder;
      await updateDoc(doc(db, 'products', editingProduct.id), data);
      const old = editingProduct.image;
      if (newPhoto && old && old.startsWith('media:')) await deleteDoc(doc(db, 'media', old.slice(6))).catch(() => {});
    } else {
      await addDoc(collection(db, 'products'), { ...data, order: nextOrder, createdAt: serverTimestamp() });
    }
    bumpCatalog();
    prodDlg.close();
  } catch (err) {
    console.error(err);
    $('prod-msg').textContent = "Couldn't save the product. Try again.";
  } finally {
    save.disabled = false;
    save.textContent = 'Save product';
  }
});
