import {
  db, auth, googleSignIn, getProfile, STATUS, statusLabel, orderCode, fmtDate, THEMES, LAYOUTS, HERO_COLORS, setImage, el,
  fmtPrice, offerInfo, comboInfo, optionsOf, cleanLabel, deliveryState, DELIVERY_NAMES, fmtWhen, bumpCatalog
} from './firebase-shared.js?v=19';
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
    if (!firstOrders) {
      snap.docChanges().forEach((c) => {
        if (c.type === 'added') notify(c.doc, 'New LoopLove order ');
        if (c.type === 'modified') {
          const was = orders.find((o) => o.id === c.doc.id);
          const now = c.doc.data();
          if (was && !was.customerConfirmed && now.customerConfirmed) notify(c.doc, 'Delivery accepted: ');
          if (was && was.status !== 'cancelled' && now.status === 'cancelled' && now.cancelledBy === 'customer') notify(c.doc, 'Cancelled by customer: ');
        }
      });
    }
    firstOrders = false;
    orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderOrders();
  }, (e) => { console.error(e); $('a-count').textContent = "Couldn't load orders. Reload the page."; }));
}

function notify(d, title) {
  const o = d.data();
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title + orderCode(d.id), {
      body: (o.customer && o.customer.name ? o.customer.name + ': ' : '') + (o.items || []).map((i) => i.qty + ' x ' + i.name).join(', ')
    });
  }
}

const alertsBtn = $('a-alerts');
function syncAlertsBtn() {
  if (!('Notification' in window)) { alertsBtn.hidden = true; return; }
  if (Notification.permission === 'granted') { alertsBtn.textContent = 'Order alerts on'; alertsBtn.disabled = true; }
  if (Notification.permission === 'denied') { alertsBtn.textContent = 'Alerts blocked in browser settings'; alertsBtn.disabled = true; }
}
alertsBtn.addEventListener('click', async () => { await Notification.requestPermission(); syncAlertsBtn(); });
syncAlertsBtn();
$('a-search').addEventListener('input', renderOrders);

function renderOrders() {
  const counts = { all: orders.length };
  STATUS.forEach(([s]) => { counts[s] = 0; });
  orders.forEach((o) => { counts[o.status] = (counts[o.status] || 0) + 1; });
  document.title = counts.new ? '(' + counts.new + ') LoopLove admin' : 'LoopLove admin';

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
    return [orderCode(o.id), 'fg-' + o.id.slice(0, 6), c.name, c.phone, c.email].some((v) => String(v || '').toLowerCase().includes(q));
  });
  $('a-count').textContent = shown.length + (shown.length === 1 ? ' order' : ' orders');
  const list = $('a-list');
  list.replaceChildren();
  if (!shown.length) { list.append(el('p', 'muted', 'No orders here yet.')); return; }
  shown.forEach((o) => list.append(orderCard(o)));
}

function numInput(value, placeholder) {
  const i = el('input');
  i.type = 'number';
  i.min = '0';
  i.step = '1';
  i.inputMode = 'numeric';
  i.placeholder = placeholder;
  if (typeof value === 'number') i.value = value;
  return i;
}

function deliveryBox(o) {
  const state = deliveryState(o);
  const box = el('div', 'a-delivery');
  if (o.status === 'cancelled') {
    box.append(el('p', 'a-dl-state', o.cancelledBy === 'customer' ? 'Cancelled by the customer.' : 'Order cancelled.'));
    return box;
  }
  if (state === 'accepted') {
    box.classList.add('ok');
    box.append(el('p', 'a-dl-state', 'Customer accepted ' + (DELIVERY_NAMES[o.deliveryChoice] || 'delivery') + ': ' + fmtPrice(o.deliveryCharge) + '. Collect the delivery charge, then confirm.'));
    return box;
  }
  const d = o.delivery || {};
  const form = el('form', 'a-dl-form');
  const ln = el('label', '', 'Normal delivery (₹)');
  const normal = numInput(typeof d.normal === 'number' ? d.normal : o.deliveryCharge, '60');
  ln.append(normal);
  const lf = el('label', '', 'Fast delivery (₹, optional)');
  const fast = numInput(d.fast, 'Leave empty if not offered');
  lf.append(fast);
  const save = el('button', 'c-btn', state === 'quoted' || state === 'free' ? 'Update' : 'Send to customer');
  save.type = 'submit';
  const msg = el('span', 'a-delivery-msg');
  form.append(ln, lf, save, msg);
  const stateText = {
    none: 'Add delivery charges. The customer picks one and accepts before you can confirm. Enter 0 with no fast option for free delivery.',
    legacy: 'Old order: send delivery charges so the customer can accept.',
    quoted: 'Waiting for the customer to accept. You can confirm once they do.',
    free: 'Free delivery. You can confirm right away.'
  }[state];
  box.append(el('p', 'a-dl-state', stateText), form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const parse = (inp) => { const r = inp.value.trim(); return r === '' ? null : Number(r); };
    const n = parse(normal), f = parse(fast);
    const ok = (v) => Number.isInteger(v) && v >= 0 && v <= 10000;
    if (n === null || !ok(n) || (f !== null && !ok(f))) { msg.textContent = 'Enter whole rupees, 0 to 10,000. Normal delivery is required.'; msg.className = 'a-delivery-msg error'; return; }
    save.disabled = true;
    const free = n === 0 && f === null;
    try {
      await updateDoc(doc(db, 'orders', o.id), {
        delivery: { normal: n, fast: f },
        deliveryCharge: free ? 0 : null,
        deliveryChoice: free ? 'normal' : null,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error(err);
      msg.textContent = "Couldn't save. Try again.";
      msg.className = 'a-delivery-msg error';
    } finally { save.disabled = false; }
  });
  return box;
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
      '&text=' + encodeURIComponent('Hi ' + (c.name || '') + ', this is LoopLove about your order ' + code + '.');
    wa.target = '_blank';
    wa.rel = 'noopener';
    contact.append(tel, wa);
  }
  if (c.email) {
    const mail = el('a', '', 'Email');
    mail.href = 'mailto:' + c.email + '?subject=' + encodeURIComponent('Your LoopLove order ' + code);
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
    if (i.options) li.append(el('span', 'a-item-opt', i.options));
    if (i.combo && i.combo.length) li.append(el('span', 'a-item-opt', 'Combo: ' + i.combo.join(' + ')));
    li.append(el('span', 'a-item-id', 'ID: ' + i.id));
    if (i.note) li.append(el('span', 'a-item-note', i.note));
    ul.append(li);
  });
  const hasDelivery = typeof o.deliveryCharge === 'number';
  if (sum) {
    ul.append(el('li', 'a-total-line', 'Items ' + fmtPrice(sum) + (unpriced ? ' plus ' + unpriced + ' unpriced' : '')));
    ul.append(el('li', 'a-total-line', 'Delivery ' + (hasDelivery ? fmtPrice(o.deliveryCharge) + (o.deliveryChoice === 'fast' ? ' (fast)' : '') : 'not chosen yet')));
    ul.append(el('li', 'a-total', 'Total ' + fmtPrice(sum + (hasDelivery ? o.deliveryCharge : 0)) + (hasDelivery ? '' : ' + delivery')));
  }
  what.append(el('h3', '', 'Items'), ul);
  if (o.note) what.append(el('p', 'a-note', 'Order note: ' + o.note));
  what.append(deliveryBox(o));

  const st = el('div', 'a-status');
  const label = el('label', '', 'Status');
  const sel = el('select');
  const state = deliveryState(o);
  const locked = o.status === 'new' && !['accepted', 'free'].includes(state);
  STATUS.forEach(([s, l]) => {
    const op = el('option', '', l);
    op.value = s;
    if (locked && !['new', 'cancelled'].includes(s)) op.disabled = true;
    sel.append(op);
  });
  sel.value = o.status;
  label.append(sel);
  const err = el('span', 'error');
  sel.addEventListener('change', async () => {
    if (sel.value === 'cancelled' && !confirm('Cancel order ' + code + '?')) { sel.value = o.status; return; }
    sel.disabled = true;
    try { await updateDoc(doc(db, 'orders', o.id), { status: sel.value, ['statusTimes.' + sel.value]: serverTimestamp(), updatedAt: serverTimestamp() }); }
    catch (e) { console.error(e); err.textContent = "Couldn't update. Try again."; sel.value = o.status; }
    finally { sel.disabled = false; }
  });
  st.append(el('span', 'pill s-' + o.status, statusLabel(o.status)), label, err);
  if (locked) st.append(el('p', 'a-lock', 'Confirm unlocks once the customer accepts the delivery charge.'));
  li.append(who, what, st);
  return li;
}

/* ---------- catalogue ---------- */

let sections = [];
let products = [];
let combos = [];
let byId = {};

function listenCatalog() {
  const got = { s: false, p: false, c: false };
  const ready = () => { if (got.s && got.p && got.c) renderCatalog(); };
  unsubs.push(onSnapshot(query(collection(db, 'sections'), orderBy('order')), (s) => {
    sections = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    got.s = true; ready();
  }, (e) => console.error(e)));
  unsubs.push(onSnapshot(query(collection(db, 'products'), orderBy('order')), (s) => {
    products = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    byId = Object.fromEntries(products.map((p) => [p.id, p]));
    got.p = true; ready();
  }, (e) => console.error(e)));
  unsubs.push(onSnapshot(collection(db, 'combos'), (s) => {
    combos = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    got.c = true; ready();
  }, (e) => { console.error(e); got.c = true; ready(); }));
}

const themeOf = (id) => THEMES.find((t) => t.id === id) || THEMES[0];
const layoutOf = (id) => LAYOUTS.find((l) => l.id === id) || LAYOUTS[0];
const sectionOf = (id) => sections.find((s) => s.id === id);
const inSection = (id) => products.filter((p) => p.sectionId === id).sort((a, b) => (a.order || 0) - (b.order || 0));
const picksOf = (s) => (s.picks || []).filter((id) => byId[id]);
const homeSections = () => sections.filter((s) => !['banner', 'offers'].includes(s.layout));

function btn(text, cls, onClick, label) {
  const b = el('button', 'c-btn' + (cls ? ' ' + cls : ''), text);
  b.type = 'button';
  if (label) b.setAttribute('aria-label', label);
  b.addEventListener('click', onClick);
  return b;
}

const fail = (what) => (e) => { console.error(e); alert("Couldn't " + what + '. Try again.'); };

async function swap(col, a, b) {
  if (!a || !b) return;
  const batch = writeBatch(db);
  batch.update(doc(db, col, a.id), { order: b.order || 0, updatedAt: serverTimestamp() });
  batch.update(doc(db, col, b.id), { order: a.order || 0, updatedAt: serverTimestamp() });
  try { await batch.commit(); bumpCatalog(); } catch (e) { fail('reorder')(e); }
}

function saveSection(s, data) {
  return updateDoc(doc(db, 'sections', s.id), { ...data, updatedAt: serverTimestamp() }).then(bumpCatalog);
}

function thumb(image) {
  const img = el('img');
  img.alt = '';
  setImage(img, image);
  return img;
}

function prodTags(p) {
  const m = el('div', 'c-meta');
  const oi = offerInfo(p);
  m.append(el('span', 'c-tag', p.price ? fmtPrice(p.price) : 'No price'));
  if (oi.active) m.append(el('span', 'c-tag deal', oi.percent + '% off, now ' + fmtPrice(oi.price)), el('span', 'c-tag', 'Ends ' + fmtWhen(oi.endsAt)));
  else if (oi.hasOffer) m.append(el('span', 'c-tag off', 'Offer ended'));
  const opts = optionsOf(p);
  if (opts.length) m.append(el('span', 'c-tag', opts.map((g) => g.values.length + ' ' + g.name.toLowerCase()).join(', ')));
  if (p.featured) m.append(el('span', 'c-tag star', 'Opening banner'));
  if (p.visible === false) m.append(el('span', 'c-tag off', 'Hidden'));
  return m;
}

function prodRow(p, actions, extraTag) {
  const row = el('div', 'c-prod');
  const info = el('div');
  info.append(el('p', 'c-prod-name', p.name));
  const tags = prodTags(p);
  if (extraTag) tags.prepend(el('span', 'c-tag pick', extraTag));
  info.append(tags);
  const a = el('div', 'c-actions');
  a.append(...actions);
  row.append(thumb(p.image), info, a);
  return row;
}

async function deleteProduct(p) {
  if (!confirm('Delete "' + p.name + '"? This cannot be undone. Past orders keep its name.')) return;
  try {
    await deleteDoc(doc(db, 'products', p.id));
    const batch = writeBatch(db);
    let n = 0;
    sections.filter((s) => (s.picks || []).includes(p.id)).forEach((s) => { batch.update(doc(db, 'sections', s.id), { picks: s.picks.filter((x) => x !== p.id) }); n++; });
    if (n) await batch.commit();
    bumpCatalog();
    const media = [p.image].concat(...optionsOf(p).map((g) => g.values.map((v) => v.image)));
    for (const m of media) if (m && m.startsWith('media:')) await deleteDoc(doc(db, 'media', m.slice(6))).catch(() => {});
  } catch (e) { fail('delete')(e); }
}

const toggleVisible = (p) => updateDoc(doc(db, 'products', p.id), { visible: p.visible === false, updatedAt: serverTimestamp() }).then(bumpCatalog).catch(fail('update'));
const endOffer = (p) => updateDoc(doc(db, 'products', p.id), { offerPercent: null, offerEndsAt: null, updatedAt: serverTimestamp() }).then(bumpCatalog).catch(fail('end the offer'));

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
    const picks = picksOf(s);
    const live = products.filter((p) => offerInfo(p).active);
    const meta = el('div', 'c-meta');
    meta.append(el('span', 'c-tag', layoutOf(s.layout).label.split(' (')[0]), el('span', 'c-tag', themeOf(s.theme).label));
    const count = s.layout === 'offers' ? live.length + combos.filter((c) => comboInfo(c, byId).active).length
      : s.layout === 'banner' ? picks.length : items.length + picks.length;
    meta.append(el('span', 'c-tag', count + (s.layout === 'offers' ? ' live' : count === 1 ? ' product' : ' products')));
    if (s.visible === false) meta.append(el('span', 'c-tag off', 'Hidden'));
    name.append(el('h3', '', s.title), meta);

    const actions = el('div', 'c-actions');
    const up = btn('↑', 'c-icon', () => swap('sections', s, sections[i - 1]), 'Move ' + s.title + ' up');
    up.disabled = i === 0;
    const down = btn('↓', 'c-icon', () => swap('sections', s, sections[i + 1]), 'Move ' + s.title + ' down');
    down.disabled = i === sections.length - 1;
    actions.append(up, down, btn('Edit', '', () => openSection(s)));
    if (s.layout === 'offers') actions.append(btn('Select products', 'main', () => openPicker(s, 'offers')), btn('New combo', 'main', () => openCombo(null)));
    else if (s.layout === 'banner') actions.append(btn('Pick 3 products', 'main', () => openPicker(s, 'banner')));
    else actions.append(btn('Select products', 'main', () => openPicker(s, 'section')));
    const del = btn('Delete', 'danger', async () => {
      if (!confirm('Delete the section "' + s.title + '"? This cannot be undone.')) return;
      try { await deleteDoc(doc(db, 'sections', s.id)); bumpCatalog(); } catch (e) { fail('delete')(e); }
    });
    del.disabled = items.length > 0;
    del.title = items.length ? 'Move or delete its products first' : '';
    actions.append(del);
    top.append(sw, name, actions);
    card.append(top);

    const body = el('div', 'c-prods');
    if (s.layout === 'offers') renderOffersBody(body, live);
    else if (s.layout === 'banner') {
      if (!picks.length) body.append(el('p', 'muted c-empty', 'No products picked, so it shows the first 3 of the next section. Tap Pick 3 products to choose them.'));
      picks.forEach((id, j) => body.append(pickRow(s, id, j, picks)));
    } else {
      if (!items.length && !picks.length) body.append(el('p', 'muted c-empty', 'No products yet. Tap Select products, or New product at the top. Empty and hidden sections do not show on the shop.'));
      items.forEach((p, j) => {
        const pu = btn('↑', 'c-icon', () => swap('products', p, items[j - 1]), 'Move ' + p.name + ' up');
        pu.disabled = j === 0;
        const pd = btn('↓', 'c-icon', () => swap('products', p, items[j + 1]), 'Move ' + p.name + ' down');
        pd.disabled = j === items.length - 1;
        body.append(prodRow(p, [pu, pd, btn('Edit', '', () => openProduct(p)), btn(p.visible === false ? 'Show' : 'Hide', '', () => toggleVisible(p)), btn('Delete', 'danger', () => deleteProduct(p))]));
      });
      picks.forEach((id, j) => body.append(pickRow(s, id, j, picks)));
    }
    card.append(body);
    root.append(card);
  });
}

function pickRow(s, id, j, picks) {
  const p = byId[id];
  const move = (d) => { const next = picks.slice(); [next[j], next[j + d]] = [next[j + d], next[j]]; saveSection(s, { picks: next }).catch(fail('reorder')); };
  const pu = btn('↑', 'c-icon', () => move(-1), 'Move ' + p.name + ' up');
  pu.disabled = j === 0;
  const pd = btn('↓', 'c-icon', () => move(1), 'Move ' + p.name + ' down');
  pd.disabled = j === picks.length - 1;
  const home = sectionOf(p.sectionId);
  return prodRow(p, [pu, pd, btn('Edit', '', () => openProduct(p)),
    btn('Remove', 'danger', () => saveSection(s, { picks: picks.filter((x) => x !== id) }).catch(fail('remove')))],
  home ? 'From ' + home.title : 'Picked');
}

function renderOffersBody(body, live) {
  body.append(el('h4', 'c-sub', 'Products on offer'));
  if (!live.length) body.append(el('p', 'muted c-empty', 'None right now. Tap Select products to put products on offer.'));
  live.sort((a, b) => offerInfo(a).endsAt - offerInfo(b).endsAt)
    .forEach((p) => body.append(prodRow(p, [btn('Edit', '', () => openProduct(p)), btn('End offer', 'danger', () => endOffer(p))])));
  body.append(el('h4', 'c-sub', 'Combos'));
  if (!combos.length) body.append(el('p', 'muted c-empty', 'No combos yet. Tap New combo to sell 2 or more products together at a lower price.'));
  combos.slice().sort((a, b) => (comboInfo(b, byId).endsAt || 0) - (comboInfo(a, byId).endsAt || 0)).forEach((c) => {
    const ci = comboInfo(c, byId);
    const row = el('div', 'c-prod c-combo-row');
    const pics = el('div', 'c-combo-pics');
    ci.items.slice(0, 3).forEach((p) => pics.append(thumb(p.image)));
    const info = el('div');
    info.append(el('p', 'c-prod-name', ci.name));
    const m = el('div', 'c-meta');
    if (ci.items.length !== (c.productIds || []).length) m.append(el('span', 'c-tag off', 'A product was deleted'));
    if (ci.original) m.append(el('span', 'c-tag', fmtPrice(ci.original)), el('span', 'c-tag deal', ci.percent + '% off, now ' + fmtPrice(ci.price)));
    m.append(ci.active ? el('span', 'c-tag', 'Ends ' + fmtWhen(ci.endsAt)) : el('span', 'c-tag off', ci.endsAt && ci.endsAt < Date.now() ? 'Ended' : 'Not showing'));
    if (c.visible === false) m.append(el('span', 'c-tag off', 'Hidden'));
    info.append(m);
    const a = el('div', 'c-actions');
    a.append(btn('Edit', '', () => openCombo(c)), btn('Delete', 'danger', async () => {
      if (!confirm('Delete the combo "' + ci.name + '"?')) return;
      try { await deleteDoc(doc(db, 'combos', c.id)); bumpCatalog(); } catch (e) { fail('delete')(e); }
    }));
    row.append(pics, info, a);
    body.append(row);
  });
}

/* ---------- offer duration fields (shared by the picker and combos) ---------- */

const DAY = 86400000;
function localInput(ms) {
  return new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function offerFields(onChange) {
  const root = el('div', 'c-two');
  const lp = el('label', '', 'Discount (%)');
  const pct = numInput(null, '20');
  pct.max = '90';
  pct.min = '1';
  lp.append(pct);
  const lf = el('label', '', 'Offer runs for');
  const sel = el('select');
  [['1', '1 day'], ['3', '3 days'], ['5', '5 days'], ['7', '1 week'], ['custom', 'Until a date I pick']].forEach(([v, t]) => { const o = el('option', '', t); o.value = v; sel.append(o); });
  lf.append(sel);
  const lu = el('label', 'c-until', 'Offer ends on');
  const until = el('input');
  until.type = 'datetime-local';
  lu.append(until);
  lu.hidden = true;
  root.append(lp, lf);
  const wrap = el('div');
  wrap.append(root, lu);
  let keepEnd = null;
  const end = () => {
    if (sel.value === 'keep') return keepEnd;
    if (sel.value === 'custom') { const t = new Date(until.value).getTime(); return Number.isFinite(t) ? t : null; }
    return Date.now() + Number(sel.value) * DAY;
  };
  const sync = () => { lu.hidden = sel.value !== 'custom'; onChange(); };
  [pct, until].forEach((i) => i.addEventListener('input', sync));
  sel.addEventListener('change', sync);
  return {
    root: wrap,
    reset(percent, endsAt) {
      const k = sel.querySelector('[value="keep"]');
      if (k) k.remove();
      keepEnd = endsAt && endsAt > Date.now() ? endsAt : null;
      pct.value = percent || '';
      if (keepEnd) {
        const o = el('option', '', 'Keep current end (' + fmtWhen(keepEnd) + ')');
        o.value = 'keep';
        sel.prepend(o);
        sel.value = 'keep';
      } else sel.value = '1';
      until.value = localInput(Date.now() + 2 * DAY);
      until.min = localInput(Date.now());
      sync();
    },
    read() {
      const p = Number(pct.value), e = end();
      if (!(Number.isInteger(p) && p >= 1 && p <= 90)) return { err: 'Enter a whole-number discount from 1 to 90 percent.' };
      if (!e || e < Date.now() + 60000) return { err: 'Pick an end time in the future.' };
      return { pct: p, end: e };
    },
    pct: () => Number(pct.value),
    end
  };
}

/* ---------- product picker: section picks, banner picks, offers ---------- */

const pickDlg = $('pick-dlg'), pickForm = $('pick-form');
let pickCtx = null;
const pickOffer = offerFields(() => renderPickList());
$('pick-offer').append(pickOffer.root);

function openPicker(s, mode) {
  const own = new Set(mode === 'section' ? inSection(s.id).map((p) => p.id) : []);
  const chosen = new Set(mode === 'offers' ? [] : picksOf(s));
  pickCtx = { s, mode, own, chosen, order: mode === 'offers' ? [] : picksOf(s) };
  $('pick-title').textContent = mode === 'offers' ? 'Put products on offer' : mode === 'banner' ? 'Pick 3 products for the banner' : 'Select products for ' + s.title;
  $('pick-help').textContent = mode === 'offers'
    ? 'Tick the products, set one discount and how long it runs. They show in ' + s.title + ' and with the offer price everywhere on the shop.'
    : mode === 'banner'
      ? 'Pick up to 3. The middle one is the big centre arch.'
      : 'Ticked products also show in this section. They stay in their own section too.';
  $('pick-offer').hidden = mode !== 'offers';
  if (mode === 'offers') pickOffer.reset('', null);
  $('pick-search').value = '';
  $('pick-msg').textContent = '';
  $('pick-save').textContent = mode === 'offers' ? 'Start offer' : 'Save';
  renderPickList();
  pickDlg.showModal();
}
$('pick-cancel').addEventListener('click', () => pickDlg.close());
$('pick-search').addEventListener('input', () => renderPickList());

function renderPickList() {
  if (!pickCtx) return;
  const { mode, own, chosen } = pickCtx;
  const q = $('pick-search').value.trim().toLowerCase();
  const list = $('pick-list');
  list.replaceChildren();
  const max = mode === 'banner' ? 3 : Infinity;
  const pct = pickOffer.pct();
  homeSections().forEach((sec) => {
    const ps = inSection(sec.id).filter((p) => !q || p.name.toLowerCase().includes(q));
    if (!ps.length) return;
    list.append(el('li', 'c-pick-group', sec.title));
    ps.forEach((p) => {
      const li = el('li');
      const lab = el('label', 'c-pick');
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = own.has(p.id) || chosen.has(p.id);
      cb.disabled = own.has(p.id) || (mode === 'offers' && !(p.price > 0)) || (!cb.checked && chosen.size >= max);
      cb.addEventListener('change', () => {
        if (cb.checked) { chosen.add(p.id); pickCtx.order.push(p.id); } else { chosen.delete(p.id); pickCtx.order = pickCtx.order.filter((x) => x !== p.id); }
        renderPickList();
      });
      const info = el('span', 'c-pick-info');
      info.append(el('span', 'c-prod-name', p.name));
      const meta = el('span', 'c-pick-meta');
      const oi = offerInfo(p);
      if (own.has(p.id)) meta.append('Lives in this section');
      else if (mode === 'offers' && !(p.price > 0)) meta.append('Add a price first');
      else if (mode === 'offers' && cb.checked && pct >= 1 && pct <= 90) {
        meta.append(el('s', '', fmtPrice(p.price)), ' ', el('strong', '', fmtPrice(Math.round(p.price * (100 - pct) / 100))));
      } else meta.append(p.price ? fmtPrice(p.price) : 'No price');
      if (oi.active) meta.append(el('span', 'c-tag deal', 'On offer ' + oi.percent + '%'));
      if (p.visible === false) meta.append(el('span', 'c-tag off', 'Hidden'));
      info.append(meta);
      lab.append(cb, thumb(p.image), info);
      li.append(lab);
      list.append(li);
    });
  });
  if (!list.children.length) list.append(el('li', 'muted c-empty', 'No products match.'));
  $('pick-count').textContent = chosen.size + ' selected' + (max < Infinity ? ' of ' + max : '');
}

pickForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const { s, mode, chosen } = pickCtx;
  const save = $('pick-save');
  $('pick-msg').textContent = '';
  if (mode === 'offers') {
    if (!chosen.size) { $('pick-msg').textContent = 'Tick at least one product.'; return; }
    const r = pickOffer.read();
    if (r.err) { $('pick-msg').textContent = r.err; return; }
    save.disabled = true;
    try {
      const batch = writeBatch(db);
      chosen.forEach((id) => batch.update(doc(db, 'products', id), { offerPercent: r.pct, offerEndsAt: Timestamp.fromMillis(r.end), updatedAt: serverTimestamp() }));
      await batch.commit();
      bumpCatalog();
      pickDlg.close();
    } catch (err) { console.error(err); $('pick-msg').textContent = "Couldn't start the offer. Try again."; } finally { save.disabled = false; }
    return;
  }
  save.disabled = true;
  try {
    await saveSection(s, { picks: pickCtx.order.filter((id) => chosen.has(id)) });
    pickDlg.close();
  } catch (err) { console.error(err); $('pick-msg').textContent = "Couldn't save. Try again."; } finally { save.disabled = false; }
});

/* ---------- combos ---------- */

const comboDlg = $('combo-dlg'), comboForm = $('combo-form');
let editingCombo = null;
let comboIds = [];
const comboOffer = offerFields(() => syncCombo());
$('combo-offer').append(comboOffer.root);

function productSelect(value) {
  const sel = el('select');
  const blank = el('option', '', 'Choose a product');
  blank.value = '';
  sel.append(blank);
  homeSections().forEach((sec) => {
    const g = el('optgroup');
    g.label = sec.title;
    inSection(sec.id).forEach((p) => {
      const o = el('option', '', p.name + (p.price ? ' (' + fmtPrice(p.price) + ')' : ' (no price)'));
      o.value = p.id;
      o.disabled = !(p.price > 0);
      g.append(o);
    });
    if (g.children.length) sel.append(g);
  });
  sel.value = value || '';
  return sel;
}

function renderComboItems() {
  const box = $('combo-items');
  box.replaceChildren();
  comboIds.forEach((id, i) => {
    const row = el('div', 'c-combo-item');
    const lab = el('label', '', 'Product ' + (i + 1));
    const sel = productSelect(id);
    sel.addEventListener('change', () => { comboIds[i] = sel.value; syncCombo(); });
    lab.append(sel);
    row.append(lab);
    if (comboIds.length > 2) row.append(btn('Remove', 'danger', () => { comboIds.splice(i, 1); renderComboItems(); }));
    box.append(row);
  });
  $('combo-add-item').hidden = comboIds.length >= 4;
  syncCombo();
}
$('combo-add-item').addEventListener('click', () => { comboIds.push(''); renderComboItems(); });

function syncCombo() {
  const calc = $('combo-calc');
  calc.replaceChildren();
  const ps = comboIds.map((id) => byId[id]).filter(Boolean);
  if (ps.length < 2) { calc.append('Choose at least 2 products.'); return; }
  const total = ps.reduce((a, p) => a + p.price, 0);
  const pct = comboOffer.pct();
  calc.append(ps.map((p) => fmtPrice(p.price)).join(' + ') + ' = ' + fmtPrice(total) + '. ');
  if (pct >= 1 && pct <= 90) {
    const now = Math.round(total * (100 - pct) / 100);
    calc.append('Combo price ', el('strong', '', fmtPrice(now)), ', saving ' + fmtPrice(total - now) + '.');
  }
  const end = comboOffer.end();
  if (end) calc.append(el('span', 'c-calc-end', 'Ends ' + fmtWhen(end) + '. Uses normal prices, not product offers.'));
}

function openCombo(c) {
  editingCombo = c || null;
  comboIds = c ? (c.productIds || []).slice() : ['', ''];
  while (comboIds.length < 2) comboIds.push('');
  $('combo-title').textContent = c ? 'Edit combo' : 'New combo';
  comboForm.elements.name.value = c ? c.name || '' : '';
  comboForm.elements.visible.checked = c ? c.visible !== false : true;
  const ci = c ? comboInfo(c, byId) : null;
  comboOffer.reset(ci ? ci.percent : '', ci ? ci.endsAt : null);
  $('combo-msg').textContent = '';
  renderComboItems();
  comboDlg.showModal();
}
$('combo-cancel').addEventListener('click', () => comboDlg.close());

comboForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const ids = comboIds.filter(Boolean);
  const msg = $('combo-msg');
  if (ids.length < 2) { msg.textContent = 'Choose at least 2 products.'; return; }
  if (new Set(ids).size !== ids.length) { msg.textContent = 'Each product can only be in the combo once.'; return; }
  const r = comboOffer.read();
  if (r.err) { msg.textContent = r.err; return; }
  const data = {
    productIds: ids, name: comboForm.elements.name.value.trim(), percent: r.pct, endsAt: Timestamp.fromMillis(r.end),
    visible: comboForm.elements.visible.checked, updatedAt: serverTimestamp()
  };
  const save = $('combo-save');
  save.disabled = true;
  try {
    if (editingCombo) await updateDoc(doc(db, 'combos', editingCombo.id), data);
    else await addDoc(collection(db, 'combos'), { ...data, createdAt: serverTimestamp() });
    bumpCatalog();
    comboDlg.close();
  } catch (err) { console.error(err); msg.textContent = "Couldn't save the combo. Try again."; } finally { save.disabled = false; }
});

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
const LAYOUT_HELP = {
  grid: 'After saving, tap Select products to fill it, or create products with New product.',
  shelf: 'After saving, tap Select products to fill it, or create products with New product.',
  gallery: 'After saving, tap Select products to fill it, or create products with New product.',
  banner: 'After saving, tap Pick 3 products to choose the photos in its arches.',
  offers: 'After saving, tap Select products to put products on offer, or New combo for a bundle deal.'
};
function syncLayoutHelp() { $('sec-layout-help').textContent = LAYOUT_HELP[secForm.elements.layout.value] || ''; }
$('sec-layout').addEventListener('change', syncLayoutHelp);

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
  syncLayoutHelp();
  secDlg.showModal();
}
$('c-new-section').addEventListener('click', () => openSection(null));
$('c-new-product').addEventListener('click', () => {
  if (!homeSections().length) { alert('Create a section first (grid, shelf or photo wall), then add products to it.'); return; }
  openProduct(null);
});
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
let optState = [];
HERO_COLORS.forEach((c) => { const o = el('option', '', c.label); o.value = c.id; $('prod-color').append(o); });

function fillSections(selected) {
  const sel = $('prod-section');
  sel.replaceChildren();
  homeSections().forEach((s) => {
    const o = el('option', '', s.title);
    o.value = s.id;
    sel.append(o);
  });
  sel.value = selected && sectionOf(selected) ? selected : (homeSections()[0] || {}).id || '';
}

function syncHero() { $('prod-hero').hidden = !$('prod-featured').checked; }
$('prod-featured').addEventListener('change', syncHero);

/* offer fields */
const offerFor = $('prod-offer-for');
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

/* options: groups such as Colour or Design, each with choices that can carry their own photo */
const MAX_GROUPS = 3, MAX_VALUES = 12;

function renderOpts() {
  const box = $('prod-opts');
  box.replaceChildren();
  optState.forEach((g, gi) => {
    const grp = el('div', 'c-opt-group');
    const head = el('div', 'c-opt-head');
    const nl = el('label', '', 'Option name');
    const ni = el('input');
    ni.maxLength = 30;
    ni.placeholder = gi === 0 ? 'Colour' : 'Design';
    ni.value = g.name;
    ni.addEventListener('input', () => { g.name = ni.value; });
    nl.append(ni);
    head.append(nl, btn('Remove option', 'danger', () => { optState.splice(gi, 1); renderOpts(); }));
    grp.append(head);
    const vals = el('ul', 'c-opt-values');
    g.values.forEach((v, vi) => {
      const li = el('li', 'c-opt-value');
      const pic = el('label', 'c-opt-pic');
      pic.title = 'Photo for this choice (optional)';
      const img = el('img');
      img.alt = '';
      if (v.newPhoto) img.src = v.newPhoto; else if (v.image) setImage(img, v.image);
      const file = el('input');
      file.type = 'file';
      file.accept = 'image/*';
      file.setAttribute('aria-label', 'Photo for ' + (v.label || 'this choice'));
      file.addEventListener('change', async () => {
        const f = file.files[0];
        if (!f || !f.type.startsWith('image/')) return;
        try { v.newPhoto = await compress(f); img.src = v.newPhoto; pic.classList.add('has'); } catch (err) { console.error(err); alert("Couldn't read that photo."); }
      });
      pic.append(img, el('span', '', 'Photo'), file);
      if (v.image || v.newPhoto) pic.classList.add('has');
      const li2 = el('input');
      li2.maxLength = 40;
      li2.placeholder = (gi === 0 ? ['Pink', 'Blue', 'Yellow'] : ['Rose', 'Daisy', 'Tulip'])[vi % 3];
      li2.value = v.label;
      li2.setAttribute('aria-label', 'Choice name');
      li2.addEventListener('input', () => { v.label = li2.value; });
      li.append(pic, li2, btn('×', 'c-icon danger', () => { g.values.splice(vi, 1); renderOpts(); }, 'Remove this choice'));
      vals.append(li);
    });
    grp.append(vals);
    const add = btn('Add a choice', '', () => {
      g.values.push({ label: '', image: '' });
      renderOpts();
      box.querySelectorAll('.c-opt-group')[gi].querySelector('.c-opt-values li:last-child input:not([type=file])').focus();
    });
    add.hidden = g.values.length >= MAX_VALUES;
    grp.append(add);
    box.append(grp);
  });
  $('prod-add-group').hidden = optState.length >= MAX_GROUPS;
}
$('prod-add-group').addEventListener('click', () => {
  optState.push({ name: optState.length ? 'Design' : 'Colour', values: [{ label: '', image: '' }, { label: '', image: '' }] });
  renderOpts();
});

function openProduct(p, sectionId) {
  editingProduct = p || null;
  newPhoto = null;
  $('prod-title').textContent = p ? 'Edit product' : 'New product';
  fillSections(p ? p.sectionId : sectionId);
  prodForm.elements.name.value = p ? p.name : '';
  prodForm.elements.description.value = p ? p.description || '' : '';
  prodForm.elements.price.value = p && p.price ? p.price : '';
  prodForm.elements.visible.checked = p ? p.visible !== false : true;
  prodForm.elements.featured.checked = p ? !!p.featured : false;
  prodForm.elements.heroLine.value = p ? p.heroLine || '' : '';
  prodForm.elements.heroColor.value = p ? p.heroColor || 'cherry' : 'cherry';
  const prev = $('prod-preview');
  prev.removeAttribute('src');
  if (p) setImage(prev, p.image);
  $('prod-file').value = '';
  ['photo', 'name', 'price', 'offer', 'opts'].forEach((k) => { $('prod-err-' + k).textContent = ''; });
  $('prod-msg').textContent = '';
  optState = p ? optionsOf(p).map((g) => ({ name: g.name, values: g.values.map((v) => ({ label: v.label, image: v.image || '' })) })) : [];
  renderOpts();
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

function checkOpts() {
  for (const g of optState) {
    const labels = g.values.map((v) => cleanLabel(v.label)).filter(Boolean);
    if (!g.name.trim()) return 'Give every option a name, like Colour.';
    if (labels.length < 2) return 'Each option needs at least 2 choices. Remove the option if there is only one.';
    if (new Set(labels.map((l) => l.toLowerCase())).size !== labels.length) return 'Choices in ' + g.name.trim() + ' must have different names.';
  }
  return '';
}

const uploadPhoto = async (data) => 'media:' + (await addDoc(collection(db, 'media'), { data, createdAt: serverTimestamp() })).id;

prodForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = prodForm.elements.name.value.trim();
  const priceRaw = prodForm.elements.price.value.trim();
  const price = priceRaw === '' ? null : Number(priceRaw);
  let bad = false;
  $('prod-err-name').textContent = name ? '' : 'Enter a name.';
  $('prod-err-price').textContent = price === null || (Number.isFinite(price) && price >= 0) ? '' : 'Enter a price in rupees, or leave it empty.';
  $('prod-err-photo').textContent = editingProduct || newPhoto ? '' : 'Choose a photo.';
  $('prod-err-opts').textContent = checkOpts();
  if (!name || $('prod-err-price').textContent || $('prod-err-photo').textContent || $('prod-err-opts').textContent) bad = true;
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
    if (newPhoto) image = await uploadPhoto(newPhoto);
    const options = [];
    for (const g of optState) {
      const values = [];
      for (const v of g.values) {
        const label = cleanLabel(v.label);
        if (!label) continue;
        values.push({ label, image: v.newPhoto ? await uploadPhoto(v.newPhoto) : v.image || '' });
      }
      options.push({ name: g.name.trim().slice(0, 30), values });
    }
    const sectionId = prodForm.elements.sectionId.value;
    const data = {
      name, price: price === null ? null : Math.round(price), sectionId, image,
      description: prodForm.elements.description.value.trim().slice(0, 600),
      options,
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
      const keep = new Set([image].concat(...options.map((g) => g.values.map((v) => v.image))));
      const old = [editingProduct.image].concat(...optionsOf(editingProduct).map((g) => g.values.map((v) => v.image)));
      for (const m of old) if (m && m.startsWith('media:') && !keep.has(m)) await deleteDoc(doc(db, 'media', m.slice(6))).catch(() => {});
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
