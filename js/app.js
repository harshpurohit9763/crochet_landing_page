import {
  db, auth, WHATSAPP, INSTAGRAM, HERO_COLORS, orderCode, googleSignIn, getProfile, setImage, el,
  fmtPrice, offerInfo, timeLeft, markLoading, loadCatalog
} from './firebase-shared.js?v=17';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  collection, getDocs, query, orderBy, doc, onSnapshot, setDoc, addDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const F = (window.FINGO = window.FINGO || {});
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);

if (!reduced && window.Lenis) {
  const lenis = new Lenis({ lerp: 0.11, anchors: true, allowNestedScroll: true });
  F.lenis = lenis;
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}

let sections = [];
let products = [];
let byId = {};
let user = null;
let profile = null;
let cart = {};
let itemNotes = {};
let note = '';
let cartUnsub = null;
let cartReady = Promise.resolve();
const controls = {};

/* ---------- helpers ---------- */

function waLink(text) {
  return 'https://api.whatsapp.com/send?phone=' + WHATSAPP + '&text=' + encodeURIComponent(text);
}

function lazyImage(img, image, eager) {
  if (!image) return;
  markLoading(img);
  if (!image.startsWith('media:')) { img.src = image; return; }
  if (eager) { setImage(img, image); return; }
  const io = new IntersectionObserver((es) => {
    if (es[0].isIntersecting) { io.disconnect(); setImage(img, image); }
  }, { rootMargin: '400px' });
  io.observe(img);
}

function priceTag(p, cls) {
  const o = offerInfo(p);
  if (!o.price) return null;
  const t = el('span', 'price-tag' + (o.active ? ' has-offer' : '') + (cls ? ' ' + cls : ''));
  if (o.active) {
    t.append(el('span', 'pt-now', fmtPrice(o.price)), el('s', 'pt-was', fmtPrice(o.original)), el('span', 'pt-off', o.percent + '% off'));
    t.setAttribute('aria-label', 'Now ' + o.price + ' rupees, was ' + o.original + ', ' + o.percent + ' percent off');
  } else {
    t.textContent = fmtPrice(o.price);
    t.setAttribute('aria-label', 'Price ' + o.price + ' rupees');
  }
  return t;
}

/* live countdowns on offer cards; an ended offer greys out and stops taking adds */
setInterval(() => {
  document.querySelectorAll('.offers-clock strong').forEach((c) => {
    const live = [...c.closest('section').querySelectorAll('.coupon-timer')]
      .map((t) => Number(t.dataset.ends)).filter((ms) => ms > Date.now());
    if (live.length) c.dataset.ends = Math.min(...live);
  });
  document.querySelectorAll('[data-ends]').forEach((e) => {
    const left = Number(e.dataset.ends) - Date.now();
    e.textContent = timeLeft(left);
    if (left <= 0) {
      const card = e.closest('.coupon');
      if (card && !card.classList.contains('ended')) {
        card.classList.add('ended');
        card.querySelectorAll('.ctl button').forEach((b) => { b.disabled = true; });
      }
    }
  });
}, 1000);

function visibleProducts(sectionId) {
  return products.filter((p) => p.sectionId === sectionId && p.visible !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

/* ---------- add / quantity control ---------- */

function mountControl(row, p) {
  const box = el('div', 'ctl');
  const add = el('button', 'add', 'Add');
  const stepper = el('div', 'stepper');
  stepper.hidden = true;
  const minus = el('button', 'step', '−');
  const n = el('span', 'step-n');
  n.setAttribute('aria-live', 'polite');
  const plus = el('button', 'step', '+');
  add.setAttribute('aria-label', 'Add ' + p.name + ' to basket');
  minus.setAttribute('aria-label', 'Remove one ' + p.name);
  plus.setAttribute('aria-label', 'Add one more ' + p.name);
  stepper.append(minus, n, plus);
  box.append(add, stepper);
  add.addEventListener('click', () => change(p.id, 1, () => plus.focus()));
  plus.addEventListener('click', () => change(p.id, 1));
  minus.addEventListener('click', () => change(p.id, -1, () => { if (!cart[p.id]) add.focus(); }));
  row.append(box);
  (controls[p.id] = controls[p.id] || []).push({ add, stepper, n });
  syncControl(p.id);
  return box;
}

function syncControl(id) {
  const n = cart[id] || 0;
  (controls[id] || []).forEach((c) => {
    c.add.hidden = n > 0;
    c.stepper.hidden = n === 0;
    c.n.textContent = n;
  });
}

/* ---------- hero ---------- */

function renderHero() {
  const hero = $('top');
  let featured = products.filter((p) => p.featured && p.visible !== false);
  if (!featured.length) featured = products.filter((p) => p.visible !== false).slice(0, 5);
  const pic = $('hero-pic'), big = $('hero-big'), name = $('hero-name'), tabs = $('hero-tabs'), ctlBox = $('hero-ctl');
  const shopAll = tabs.querySelector('.shop-all');
  const items = featured.map((p) => {
    const img = el('img');
    img.alt = p.name;
    lazyImage(img, p.image);
    pic.append(img);
    const ctl = mountControl(ctlBox, p);
    const tab = el('button', 'tab');
    tab.setAttribute('aria-label', 'Show ' + p.name);
    const ti = el('img');
    ti.alt = '';
    lazyImage(ti, p.image);
    tab.append(ti);
    tabs.insertBefore(tab, shopAll);
    const col = HERO_COLORS.find((c) => c.id === p.heroColor) || HERO_COLORS[0];
    return { p, img, ctl, tab, col };
  });
  if (!items.length) return;
  let current = -1;
  function show(n) {
    if (n === current) return;
    current = n;
    hero.style.setProperty('--c', items[n].col.c);
    hero.style.setProperty('--t', items[n].col.t);
    big.textContent = items[n].p.heroLine || items[n].p.name;
    name.replaceChildren(items[n].p.name);
    const tag = priceTag(items[n].p, 'in-hero');
    if (tag) name.append(tag);
    items.forEach((x, i) => {
      x.img.className = i === n ? 'on' : '';
      x.tab.className = i === n ? 'tab on' : 'tab';
      x.ctl.hidden = i !== n;
    });
  }
  let timer = null;
  items.forEach((x, i) => {
    const pick = () => { clearInterval(timer); show(i); };
    x.tab.addEventListener('mouseenter', pick);
    x.tab.addEventListener('focus', pick);
    x.tab.addEventListener('click', pick);
  });
  show(0);
  if (!reduced && items.length > 1) {
    timer = setInterval(() => { if (scrollY < innerHeight * 0.6) show((current + 1) % items.length); }, 4500);
  }
  F.yarn({ host: hero, from: big, fx: 0, fy: 1, rest: [0.5, 0.74], color: 'var(--t)', w: 5 });
}

/* ---------- sections ---------- */

function head(s) {
  const h = el('header', 'sec-head');
  h.append(el('h2', '', s.title));
  if (s.subtitle) h.append(el('p', '', s.subtitle));
  return h;
}

function gridSection(s, list) {
  const wrap = el('div', 'wrap');
  const grid = el('div', 'plants');
  list.forEach((p) => {
    const a = el('article', 'plant');
    const pic = el('span', 'plant-pic');
    const img = el('img');
    img.alt = p.name;
    img.loading = 'lazy';
    lazyImage(img, p.image);
    pic.append(img);
    const tag = priceTag(p);
    if (tag) pic.append(tag);
    const row = el('div', 'plant-row');
    row.append(el('h3', '', p.name));
    mountControl(row, p);
    a.append(pic, row);
    grid.append(a);
  });
  wrap.append(head(s), grid);
  return [wrap];
}

function shelfSection(s, list) {
  const wrap = el('div', 'wrap');
  wrap.append(head(s));
  const shelf = el('div', 'shelf');
  shelf.tabIndex = 0;
  shelf.setAttribute('aria-label', s.title);
  list.forEach((p) => {
    const a = el('article', 'arch');
    const fig = el('figure');
    const img = el('img');
    img.alt = p.name;
    img.loading = 'lazy';
    img.draggable = false;
    lazyImage(img, p.image, true);
    fig.append(img);
    const tag = priceTag(p, 'on-arch');
    if (tag) fig.append(tag);
    const row = el('div', 'arch-row');
    row.append(el('h3', '', p.name));
    mountControl(row, p);
    a.append(fig, row);
    shelf.append(a);
  });
  let down = false, sx = 0, sl = 0;
  shelf.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.target.closest('.ctl')) return;
    down = true; sx = e.clientX; sl = shelf.scrollLeft;
    shelf.classList.add('dragging');
    shelf.setPointerCapture(e.pointerId);
  });
  shelf.addEventListener('pointermove', (e) => { if (down) shelf.scrollLeft = sl - (e.clientX - sx); });
  const stop = () => { down = false; shelf.classList.remove('dragging'); };
  shelf.addEventListener('pointerup', stop);
  shelf.addEventListener('pointercancel', stop);
  return [wrap, shelf];
}

const TILTS = ['-3deg', '2.5deg', '-1.5deg', '3deg', '-2.5deg', '1.5deg'];
function gallerySection(s, list) {
  const wrap = el('div', 'wrap');
  const wall = el('div', 'wall');
  list.forEach((p, i) => {
    const f = el('figure', 'pin');
    f.style.setProperty('--r', TILTS[i % TILTS.length]);
    const img = el('img');
    img.alt = p.name;
    img.loading = 'lazy';
    lazyImage(img, p.image);
    const cap = el('figcaption');
    cap.append(el('span', '', p.name));
    mountControl(cap, p);
    f.append(img, cap);
    const tag = priceTag(p);
    if (tag) f.append(tag);
    wall.append(f);
  });
  wrap.append(head(s), wall);
  return [wrap];
}

function bannerSection(s, next) {
  const body = el('div', 'door-body');
  const h = el('h2', '', s.title);
  body.append(h);
  if (s.subtitle) body.append(el('p', 'door-lede', s.subtitle));
  if (next) {
    const btn = el('a', 'door-btn', 'See ' + next.title.toLowerCase());
    btn.href = '#sec-' + next.id;
    body.append(btn);
    const arches = el('div', 'door-arches');
    visibleProducts(next.id).slice(0, 3).forEach((p, i) => {
      const a = el('div', 'door-arch' + (i === 1 ? ' mid' : ''));
      a.dataset.d = i === 1 ? -16 : 10;
      const img = el('img');
      img.alt = p.name;
      img.loading = 'lazy';
      lazyImage(img, p.image);
      a.append(img);
      arches.append(a);
    });
    body.append(arches);
  }
  requestAnimationFrame(() => F.yarn({ host: body, from: h, fx: 0.94, fy: 0.86, rest: [0.9, 0.34], color: '#F2A71B', w: 4 }));
  return [body];
}

function offersSection(s, list) {
  const wrap = el('div', 'wrap');
  const h = el('header', 'sec-head offers-head');
  const titleBox = el('div');
  titleBox.append(el('h2', '', s.title));
  if (s.subtitle) titleBox.append(el('p', '', s.subtitle));
  const soonest = Math.min(...list.map((p) => offerInfo(p).endsAt));
  const first = el('p', 'offers-clock');
  first.append(el('span', '', 'Next offer'), el('strong'));
  first.lastChild.dataset.ends = soonest;
  first.lastChild.textContent = timeLeft(soonest - Date.now());
  h.append(titleBox, first);

  const grid = el('div', 'coupons');
  list.forEach((p) => {
    const o = offerInfo(p);
    const card = el('article', 'coupon');
    const pic = el('div', 'coupon-pic');
    const img = el('img');
    img.alt = p.name;
    img.loading = 'lazy';
    lazyImage(img, p.image);
    pic.append(img, el('span', 'coupon-stamp', o.percent + '%\nOFF'));
    const body = el('div', 'coupon-body');
    const price = el('p', 'coupon-price');
    price.append(el('strong', '', fmtPrice(o.price)), el('s', '', fmtPrice(o.original)));
    const timer = el('p', 'coupon-timer', timeLeft(o.endsAt - Date.now()));
    timer.dataset.ends = o.endsAt;
    const row = el('div', 'coupon-row');
    mountControl(row, p);
    body.append(el('h3', '', p.name), price, el('p', 'coupon-save', 'You save ' + fmtPrice(o.save)), timer, row);
    card.append(pic, body);
    grid.append(card);
  });
  wrap.append(h, grid);
  return [wrap];
}

// An offers section shows every visible product with a running offer, wherever it lives,
// so an admin only has to switch the offer on. Soonest-ending first.
function sectionList(s) {
  if (s.layout !== 'offers') return visibleProducts(s.id);
  return products.filter((p) => p.visible !== false && offerInfo(p).active)
    .sort((a, b) => offerInfo(a).endsAt - offerInfo(b).endsAt);
}

function renderSections() {
  const root = $('sections');
  const bar = $('secbar-links');
  root.replaceChildren();
  bar.replaceChildren();
  sections.forEach((s, i) => {
    const list = sectionList(s);
    const layout = s.layout || 'grid';
    if (layout !== 'banner' && !list.length) return;
    const sec = el('section', 'sec theme-' + (s.theme || 'plain') + ' layout-' + layout);
    sec.id = 'sec-' + s.id;
    const next = sections.slice(i + 1).find((x) => !['banner', 'offers'].includes(x.layout) && sectionList(x).length);
    const parts = layout === 'shelf' ? shelfSection(s, list)
      : layout === 'gallery' ? gallerySection(s, list)
      : layout === 'banner' ? bannerSection(s, next)
      : layout === 'offers' ? offersSection(s, list)
      : gridSection(s, list);
    sec.append(...parts);
    root.append(sec);
    if (layout !== 'banner') {
      const a = el('a', 'chip', s.title);
      a.href = '#' + sec.id;
      bar.append(a);
    }
  });
  if (!root.children.length) root.append(el('p', 'loading wrap', 'New pieces are on the way. Check back soon.'));
}

addEventListener('pointermove', (e) => {
  const k = e.clientX / innerWidth - 0.5;
  document.querySelectorAll('.door-arch').forEach((a) => { a.style.transform = 'translateX(' + k * a.dataset.d + 'px)'; });
}, { passive: true });

/* ---------- basket ---------- */

const drawer = $('drawer'), scrim = $('scrim'), list = $('basket-list'), empty = $('basket-empty');
const send = $('basket-send'), noteEl = $('basket-note'), floating = $('basket-open');
const hint = $('order-hint'), msg = $('order-msg');
let opener = floating;

// The saved basket can arrive before the product list. Until the list is loaded, keep every
// basket entry as is and only show the ones we can already describe.
let catalogReady = false;
const known = () => Object.keys(cart).filter((id) => byId[id] && cart[id] > 0);

function total() { return known().reduce((a, k) => a + cart[k], 0); }

function itemNote(id) { return String(itemNotes[id] || '').trim(); }

function totals() {
  let sum = 0, save = 0, unpriced = 0;
  known().forEach((id) => {
    const o = offerInfo(byId[id]);
    if (o.price) { sum += o.price * cart[id]; save += o.save * cart[id]; } else unpriced++;
  });
  return { sum, save, unpriced };
}

function waText(code) {
  const lines = known().map((id) => {
    const o = offerInfo(byId[id]);
    const price = o.price ? ' @ ' + fmtPrice(o.price) + (o.active ? ' (' + o.percent + '% off ' + fmtPrice(o.original) + ')' : '') : '';
    return '- ' + cart[id] + ' x ' + byId[id].name + price + (itemNote(id) ? '\n  Note: ' + itemNote(id) : '');
  });
  let text = 'Hi Fingo! I would like to order' + (code ? ' (' + code + ')' : '') + ':\n' + lines.join('\n');
  const t = totals();
  if (t.sum) text += '\n\nItems total: ' + fmtPrice(t.sum) + (t.unpriced ? ' plus items to be priced' : '') + (t.save ? ' (you save ' + fmtPrice(t.save) + ')' : '');
  text += '\nDelivery: to be added by Fingo';
  if (note.trim()) text += '\n\nNote: ' + note.trim();
  return text;
}

const lines = new Map();
let itemNoteTimer;

function makeLine(id) {
  const p = byId[id];
  const li = el('li', 'line');
  const img = el('img');
  img.alt = '';
  lazyImage(img, p.image);
  const q = el('span', 'qty');
  const minus = el('button', '', '−');
  minus.setAttribute('aria-label', 'One less ' + p.name);
  const plus = el('button', '', '+');
  plus.setAttribute('aria-label', 'One more ' + p.name);
  minus.addEventListener('click', () => change(id, -1));
  plus.addEventListener('click', () => change(id, 1));
  const count = el('span');
  q.append(minus, count, plus);
  const input = el('input', 'line-note');
  input.type = 'text';
  input.maxLength = 200;
  input.placeholder = 'Note for this item: colour, size…';
  input.setAttribute('aria-label', 'Note for ' + p.name);
  input.addEventListener('input', () => {
    itemNotes[id] = input.value;
    clearTimeout(itemNoteTimer);
    itemNoteTimer = setTimeout(saveCart, 600);
  });
  const name = el('span', 'line-name', p.name);
  const priceEl = el('span', 'line-price');
  name.append(priceEl);
  li.append(img, name, q, input);
  list.append(li);
  const rec = { li, count, input, priceEl };
  lines.set(id, rec);
  return rec;
}

function renderCart() {
  if (catalogReady) {
    Object.keys(cart).forEach((id) => { if (!byId[id] || !(cart[id] > 0)) delete cart[id]; });
    Object.keys(itemNotes).forEach((id) => { if (!cart[id]) delete itemNotes[id]; });
  }
  const ids = known();
  lines.forEach((rec, id) => { if (!ids.includes(id)) { rec.li.remove(); lines.delete(id); } });
  ids.forEach((id) => {
    const rec = lines.get(id) || makeLine(id);
    rec.count.textContent = cart[id];
    const o = offerInfo(byId[id]);
    rec.priceEl.replaceChildren();
    if (o.price) {
      rec.priceEl.append(fmtPrice(o.price * cart[id]));
      if (o.active) rec.priceEl.append(' ', el('s', '', fmtPrice(o.original * cart[id])), ' ', el('span', 'line-off', o.percent + '% off'));
    } else {
      rec.priceEl.append('Price confirmed on WhatsApp');
    }
    if (document.activeElement !== rec.input) rec.input.value = itemNotes[id] || '';
  });
  const t = totals();
  const totalEl = $('basket-total');
  totalEl.replaceChildren();
  if (t.sum) {
    totalEl.append(el('span', '', 'Total'), el('strong', '', fmtPrice(t.sum)));
    if (t.unpriced) totalEl.append(el('small', '', 'plus ' + t.unpriced + (t.unpriced === 1 ? ' item' : ' items') + ' priced on WhatsApp'));
    if (t.save) totalEl.append(el('small', 'save', 'You save ' + fmtPrice(t.save)));
  }
  const n = total();
  $('delivery-note').hidden = n === 0;
  document.querySelectorAll('.basket-count').forEach((c) => { c.textContent = n; });
  empty.hidden = n > 0;
  send.disabled = n === 0;
  if (document.activeElement !== noteEl) noteEl.value = note;
  Object.keys(controls).forEach(syncControl);
  renderHint();
}

function renderHint() {
  hint.replaceChildren();
  if (user && profile && profile.address) {
    hint.append('Delivering to ' + profile.name + ', ' + profile.address.split('\n')[0] + '. ');
    const a = el('a', 'link', 'Change');
    a.href = 'profile.html?next=checkout';
    hint.append(a);
  }
}

function saveCart() {
  if (!user) return Promise.resolve();
  const notes = {};
  Object.keys(cart).forEach((id) => { if (itemNotes[id]) notes[id] = String(itemNotes[id]).slice(0, 200); });
  return setDoc(doc(db, 'carts', user.uid), { items: cart, itemNotes: notes, note, updatedAt: serverTimestamp() })
    .catch((e) => { console.error(e); msg.textContent = "Couldn't save your basket. Check your connection."; });
}

function change(id, d, after) {
  if (!user) { requireLogin(() => change(id, d, after)); return; }
  cart[id] = (cart[id] || 0) + d;
  if (cart[id] <= 0) delete cart[id];
  renderCart();
  saveCart();
  if (d > 0) {
    floating.classList.remove('bump');
    void floating.offsetWidth;
    floating.classList.add('bump');
  }
  if (after) after();
}

let noteTimer;
noteEl.addEventListener('input', () => {
  note = noteEl.value;
  clearTimeout(noteTimer);
  noteTimer = setTimeout(saveCart, 600);
});

function openDrawer() {
  drawer.inert = false;
  drawer.classList.add('open');
  scrim.hidden = false;
  if (F.lenis) F.lenis.stop();
  $('basket-close').focus();
}
function closeDrawer() {
  drawer.classList.remove('open', 'done');
  drawer.inert = true;
  scrim.hidden = true;
  if (F.lenis) F.lenis.start();
  opener.focus();
}
document.querySelectorAll('[data-basket-open]').forEach((b) => b.addEventListener('click', () => { opener = b; openDrawer(); }));
$('basket-close').addEventListener('click', closeDrawer);
scrim.addEventListener('click', closeDrawer);
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && drawer.classList.contains('open') && !document.querySelector('dialog[open]')) closeDrawer();
});
$('order-more').addEventListener('click', closeDrawer);

new IntersectionObserver((es) => floating.classList.toggle('tucked', es[0].isIntersecting), { threshold: 0.15 }).observe($('top'));

/* ---------- checkout ---------- */

let busy = false;
send.addEventListener('click', async () => {
  if (busy || !total()) return;
  msg.textContent = '';
  msg.classList.remove('ok');
  if (!user) { requireLogin(() => send.click()); return; }
  if (!(profile && profile.name && profile.phone && profile.address)) {
    clearTimeout(noteTimer);
    await saveCart();
    location.href = 'profile.html?next=checkout';
    return;
  }
  busy = true;
  send.textContent = 'Saving your order…';
  try {
    clearTimeout(itemNoteTimer);
    const items = known().map((id) => {
      const o = offerInfo(byId[id]);
      return {
        id, name: byId[id].name, qty: cart[id], price: o.price || null,
        originalPrice: o.active ? o.original : null, offerPercent: o.active ? o.percent : null,
        note: itemNote(id).slice(0, 200)
      };
    });
    const ref = await addDoc(collection(db, 'orders'), {
      uid: user.uid,
      customer: { name: profile.name, phone: profile.phone, address: profile.address, email: user.email || '' },
      items, note: note.trim(), status: 'new', createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    const code = orderCode(ref.id);
    $('order-code').textContent = code;
    $('order-wa').href = waLink(waText(code));
    drawer.classList.add('done');
    cart = {};
    itemNotes = {};
    note = '';
    renderCart();
    saveCart();
    $('order-wa').focus();
  } catch (e) {
    console.error(e);
    msg.textContent = "Couldn't save your order. Check your connection and try again.";
  } finally {
    busy = false;
    send.textContent = 'Order on WhatsApp';
  }
});

/* ---------- how to order dropdown ---------- */

const howBtn = $('how-btn'), howPanel = $('how-panel');
function setHow(open, focusBtn) {
  howBtn.setAttribute('aria-expanded', open);
  howPanel.hidden = !open;
  if (!open && focusBtn) howBtn.focus();
}
howBtn.addEventListener('click', (e) => { e.stopPropagation(); setHow(howPanel.hidden); });
document.addEventListener('click', (e) => { if (!howPanel.hidden && !e.target.closest('.howto')) setHow(false); });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !howPanel.hidden) setHow(false, true); });
document.querySelector('.howto').addEventListener('focusout', (e) => {
  if (!howPanel.hidden && !e.currentTarget.contains(e.relatedTarget)) setHow(false);
});

/* ---------- sign in ---------- */

const loginDlg = $('login-dlg');
let pending = null;

function requireLogin(then) {
  pending = then;
  $('login-msg').textContent = '';
  loginDlg.showModal();
}
$('login-cancel').addEventListener('click', () => { pending = null; loginDlg.close(); });
$('login-go').addEventListener('click', async () => {
  $('login-msg').textContent = '';
  try {
    try { sessionStorage.setItem('fingo-after-login', drawer.classList.contains('open') ? 'basket' : ''); } catch (e) {}
    const u = await googleSignIn();
    if (!u) return;
    await new Promise((r) => setTimeout(r, 0));
    await cartReady;
    loginDlg.close();
    const then = pending;
    pending = null;
    if (then) then();
  } catch (e) {
    console.error(e);
    $('login-msg').textContent = "Couldn't sign in with Google. Try again.";
  }
});

onAuthStateChanged(auth, (u) => {
  user = u;
  profile = null;
  if (cartUnsub) { cartUnsub(); cartUnsub = null; }
  const acc = $('account-btn');
  $('admin-link').hidden = true;
  if (!u) {
    cart = {};
    itemNotes = {};
    note = '';
    acc.textContent = 'Sign in';
    renderCart();
    cartReady = Promise.resolve();
    return;
  }
  acc.textContent = (u.displayName || 'Account').split(' ')[0];
  getProfile(u.uid).then((p) => {
    profile = p;
    if (p && p.name) acc.textContent = p.name.split(' ')[0];
    $('admin-link').hidden = !(p && p.role === 'admin');
    renderHint();
  }).catch((e) => console.error(e));
  cartReady = new Promise((resolve) => {
    let first = true;
    cartUnsub = onSnapshot(doc(db, 'carts', u.uid), (snap) => {
      const data = snap.exists() ? snap.data() : {};
      cart = Object.assign({}, data.items || {});
      let typing = null;
      lines.forEach((rec, id) => { if (rec.input === document.activeElement) typing = [id, rec.input.value]; });
      itemNotes = Object.assign({}, data.itemNotes || {});
      if (typing) itemNotes[typing[0]] = typing[1];
      if (document.activeElement !== noteEl) note = data.note || '';
      if (first) {
        first = false;
        let legacy = {};
        try { legacy = JSON.parse(localStorage.getItem('fingo-basket')) || {}; localStorage.removeItem('fingo-basket'); } catch (e) {}
        const ids = Object.keys(legacy).filter((id) => !cart[id]);
        ids.forEach((id) => { cart[id] = legacy[id]; });
        renderCart();
        if (ids.length) saveCart();
        resolve();
      } else {
        renderCart();
      }
    }, (e) => { console.error(e); resolve(); });
  });
});

/* ---------- boot ---------- */

$('foot-wa').href = waLink('Hi Fingo!');
$('foot-ig').href = INSTAGRAM;

async function boot() {
  try {
    const cat = await loadCatalog();
    const s = cat.sections, p = cat.products;
    F.catalogFromCache = cat.fromCache;
    sections = s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.visible !== false);
    products = p.docs.map((d) => ({ id: d.id, ...d.data() }));
    byId = Object.fromEntries(products.map((x) => [x.id, x]));
    catalogReady = true;
  } catch (e) {
    console.error(e);
    $('sections').replaceChildren(el('p', 'loading wrap', "Couldn't load the shop. Check your connection and refresh."));
    return;
  }
  renderHero();
  renderSections();
  renderCart();
  await cartReady;
  let after = '';
  try { after = sessionStorage.getItem('fingo-after-login') || ''; sessionStorage.removeItem('fingo-after-login'); } catch (e) {}
  if (location.hash === '#checkout' || (after === 'basket' && user)) {
    const back = location.hash === '#checkout';
    history.replaceState(null, '', location.pathname);
    openDrawer();
    if (back && total()) {
      msg.textContent = 'Details saved. Tap Order on WhatsApp to place your order.';
      msg.classList.add('ok');
    }
  }
}
boot();
