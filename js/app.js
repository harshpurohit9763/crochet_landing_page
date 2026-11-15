import {
  db, auth, WHATSAPP, INSTAGRAM, HERO_COLORS, orderCode, googleSignIn, getProfile, setImage, el,
  fmtPrice, offerInfo, comboInfo, optionsOf, variantKey, parseKey, timeLeft, markLoading, loadCatalog
} from './firebase-shared.js?v=18';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  collection, doc, onSnapshot, setDoc, addDoc, serverTimestamp
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
let combos = [];
let byId = {};
let comboById = {};
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

const shown = (p) => p && p.visible !== false;

function visibleProducts(s) {
  const own = products.filter((p) => p.sectionId === s.id && shown(p)).sort((a, b) => (a.order || 0) - (b.order || 0));
  const ids = new Set(own.map((p) => p.id));
  const picked = (s.picks || []).map((id) => byId[id]).filter((p) => shown(p) && !ids.has(p.id));
  return own.concat(picked);
}

// Opens the product page from a tile. The name is a real button; the photo is a mouse shortcut.
function detailName(tag, p) {
  const h = el(tag);
  const b = el('button', 'pname', p.name);
  b.type = 'button';
  b.addEventListener('click', () => openDetail(p.id));
  h.append(b);
  return h;
}
function detailClick(box, p) {
  box.classList.add('to-detail');
  box.addEventListener('click', (e) => { if (!e.target.closest('.ctl, .price-tag button')) openDetail(p.id); });
}

/* ---------- add / quantity control ---------- */

function mountControl(row, key, label) {
  const box = el('div', 'ctl');
  const add = el('button', 'add', 'Add');
  const stepper = el('div', 'stepper');
  stepper.hidden = true;
  const minus = el('button', 'step', '−');
  const n = el('span', 'step-n');
  n.setAttribute('aria-live', 'polite');
  const plus = el('button', 'step', '+');
  add.setAttribute('aria-label', 'Add ' + label + ' to basket');
  minus.setAttribute('aria-label', 'Remove one ' + label);
  plus.setAttribute('aria-label', 'Add one more ' + label);
  stepper.append(minus, n, plus);
  box.append(add, stepper);
  add.addEventListener('click', () => change(key, 1, () => plus.focus()));
  plus.addEventListener('click', () => change(key, 1));
  minus.addEventListener('click', () => change(key, -1, () => { if (!cart[key]) add.focus(); }));
  row.append(box);
  (controls[key] = controls[key] || []).push({ add, stepper, n });
  syncControl(key);
  return box;
}

// Products with options are added from their page, where the customer picks colour and design.
function productControl(row, p) {
  if (!optionsOf(p).length) return mountControl(row, p.id, p.name);
  const box = el('div', 'ctl');
  const b = el('button', 'add choose', 'Choose');
  b.setAttribute('aria-label', 'Choose options for ' + p.name);
  b.addEventListener('click', () => openDetail(p.id));
  box.append(b);
  row.append(box);
  return box;
}

function syncControl(key) {
  const n = cart[key] || 0;
  (controls[key] || []).forEach((c) => {
    c.add.hidden = n > 0;
    c.stepper.hidden = n === 0;
    c.n.textContent = n;
  });
}

/* ---------- hero ---------- */

function renderHero() {
  const hero = $('top');
  let featured = products.filter((p) => p.featured && shown(p));
  if (!featured.length) featured = products.filter(shown).slice(0, 5);
  const pic = $('hero-pic'), big = $('hero-big'), name = $('hero-name'), tabs = $('hero-tabs'), ctlBox = $('hero-ctl');
  const shopAll = tabs.querySelector('.shop-all');
  const items = featured.map((p) => {
    const img = el('img');
    img.alt = p.name;
    lazyImage(img, p.image);
    pic.append(img);
    const ctl = productControl(ctlBox, p);
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
    name.replaceChildren();
    const nb = el('button', 'pname', items[n].p.name);
    nb.type = 'button';
    nb.addEventListener('click', () => openDetail(items[n].p.id));
    name.append(nb);
    const tag = priceTag(items[n].p, 'in-hero');
    if (tag) name.append(tag);
    items.forEach((x, i) => {
      x.img.className = i === n ? 'on' : '';
      x.tab.className = i === n ? 'tab on' : 'tab';
      x.ctl.hidden = i !== n;
    });
  }
  pic.classList.add('to-detail');
  pic.addEventListener('click', () => openDetail(items[current].p.id));
  let timer = null;
  items.forEach((x, i) => {
    const pick = () => { clearInterval(timer); show(i); };
    x.tab.addEventListener('mouseenter', pick);
    x.tab.addEventListener('focus', pick);
    x.tab.addEventListener('click', pick);
  });
  show(0);
  if (!reduced && items.length > 1) {
    timer = setInterval(() => { if (scrollY < innerHeight * 0.6 && !pd.open) show((current + 1) % items.length); }, 4500);
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
    detailClick(pic, p);
    const tag = priceTag(p);
    if (tag) pic.append(tag);
    const row = el('div', 'plant-row');
    row.append(detailName('h3', p));
    productControl(row, p);
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
    detailClick(fig, p);
    const tag = priceTag(p, 'on-arch');
    if (tag) fig.append(tag);
    const row = el('div', 'arch-row');
    row.append(detailName('h3', p));
    productControl(row, p);
    a.append(fig, row);
    shelf.append(a);
  });
  let down = false, moved = false, sx = 0, sl = 0;
  shelf.addEventListener('pointerdown', (e) => {
    moved = false;
    if (e.pointerType !== 'mouse' || e.target.closest('.ctl, button')) return;
    down = true; sx = e.clientX; sl = shelf.scrollLeft;
    shelf.classList.add('dragging');
    shelf.setPointerCapture(e.pointerId);
  });
  shelf.addEventListener('pointermove', (e) => {
    if (!down) return;
    if (Math.abs(e.clientX - sx) > 6) moved = true;
    shelf.scrollLeft = sl - (e.clientX - sx);
  });
  const stop = () => { down = false; shelf.classList.remove('dragging'); };
  shelf.addEventListener('pointerup', stop);
  shelf.addEventListener('pointercancel', stop);
  shelf.addEventListener('click', (e) => { if (moved) { e.stopPropagation(); moved = false; } }, true);
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
    detailClick(img, p);
    const cap = el('figcaption');
    cap.append(detailName('span', p));
    productControl(cap, p);
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
  const picked = (s.picks || []).map((id) => byId[id]).filter(shown).slice(0, 3);
  const pics = picked.length ? picked : next ? visibleProducts(next).slice(0, 3) : [];
  if (next) {
    const btn = el('a', 'door-btn', 'See ' + next.title.toLowerCase());
    btn.href = '#sec-' + next.id;
    body.append(btn);
  }
  if (pics.length) {
    const arches = el('div', 'door-arches');
    pics.forEach((p, i) => {
      const a = el('div', 'door-arch' + (i === 1 ? ' mid' : ''));
      a.dataset.d = i === 1 ? -16 : 10;
      const img = el('img');
      img.alt = p.name;
      img.loading = 'lazy';
      lazyImage(img, p.image);
      a.append(img);
      detailClick(a, p);
      arches.append(a);
    });
    body.append(arches);
  }
  requestAnimationFrame(() => F.yarn({ host: body, from: h, fx: 0.94, fy: 0.86, rest: [0.9, 0.34], color: '#F2A71B', w: 4 }));
  return [body];
}

function couponTimer(endsAt) {
  const timer = el('p', 'coupon-timer', timeLeft(endsAt - Date.now()));
  timer.dataset.ends = endsAt;
  return timer;
}

function productCoupon(p) {
  const o = offerInfo(p);
  const card = el('article', 'coupon');
  const pic = el('div', 'coupon-pic');
  const img = el('img');
  img.alt = p.name;
  img.loading = 'lazy';
  lazyImage(img, p.image);
  pic.append(img, el('span', 'coupon-stamp', o.percent + '%\nOFF'));
  detailClick(pic, p);
  const body = el('div', 'coupon-body');
  const price = el('p', 'coupon-price');
  price.append(el('strong', '', fmtPrice(o.price)), el('s', '', fmtPrice(o.original)));
  const row = el('div', 'coupon-row');
  productControl(row, p);
  body.append(detailName('h3', p), price, el('p', 'coupon-save', 'You save ' + fmtPrice(o.save)), couponTimer(o.endsAt), row);
  card.append(pic, body);
  return card;
}

function comboCoupon(c) {
  const ci = comboInfo(c, byId);
  const card = el('article', 'coupon combo');
  const pic = el('div', 'coupon-pic combo-pic');
  ci.items.slice(0, 3).forEach((p) => {
    const img = el('img');
    img.alt = p.name;
    img.loading = 'lazy';
    lazyImage(img, p.image);
    pic.append(img);
  });
  pic.append(el('span', 'coupon-stamp', 'COMBO\n' + ci.percent + '%'));
  const body = el('div', 'coupon-body');
  const price = el('p', 'coupon-price');
  price.append(el('strong', '', fmtPrice(ci.price)), el('s', '', fmtPrice(ci.original)));
  const parts = el('ul', 'combo-parts');
  ci.items.forEach((p) => {
    const li = el('li');
    const b = el('button', 'pname', p.name);
    b.type = 'button';
    b.addEventListener('click', () => openDetail(p.id));
    li.append(b, ' ', el('span', '', fmtPrice(p.price)));
    parts.append(li);
  });
  const row = el('div', 'coupon-row');
  mountControl(row, 'combo:' + c.id, ci.name);
  body.append(el('span', 'combo-kicker', 'Combo deal'), el('h3', '', ci.name), parts, price, el('p', 'coupon-save', 'You save ' + fmtPrice(ci.save)), couponTimer(ci.endsAt), row);
  card.append(pic, body);
  return card;
}

function offersSection(s, list) {
  const wrap = el('div', 'wrap');
  const h = el('header', 'sec-head offers-head');
  const titleBox = el('div');
  titleBox.append(el('h2', '', s.title));
  if (s.subtitle) titleBox.append(el('p', '', s.subtitle));
  const soonest = Math.min(...list.map((x) => x.ends));
  const first = el('p', 'offers-clock');
  first.append(el('span', '', 'Next offer'), el('strong'));
  first.lastChild.dataset.ends = soonest;
  first.lastChild.textContent = timeLeft(soonest - Date.now());
  h.append(titleBox, first);
  const grid = el('div', 'coupons');
  list.forEach((x) => grid.append(x.c ? comboCoupon(x.c) : productCoupon(x.p)));
  wrap.append(h, grid);
  return [wrap];
}

// An offers section shows every visible product with a running offer, wherever it lives,
// plus running combos. Soonest-ending first.
function sectionList(s) {
  if (s.layout !== 'offers') return visibleProducts(s);
  const ps = products.filter((p) => shown(p) && offerInfo(p).active).map((p) => ({ p, ends: offerInfo(p).endsAt }));
  const cs = combos.filter((c) => comboInfo(c, byId).active).map((c) => ({ c, ends: comboInfo(c, byId).endsAt }));
  return ps.concat(cs).sort((a, b) => a.ends - b.ends);
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

/* ---------- basket entries: products, product options, combos ---------- */

// Everything the basket, WhatsApp text and order need to know about one basket key,
// or null when it no longer matches the catalogue.
function describe(key) {
  const k = parseKey(key);
  if (k.combo) {
    const c = comboById[k.id];
    if (!c) return null;
    const ci = comboInfo(c, byId);
    if (ci.items.length !== (c.productIds || []).length || !ci.original) return null;
    return {
      name: ci.name, sub: c.name ? ci.items.map((p) => p.name).join(' + ') : '', image: ci.items[0].image,
      price: ci.active ? ci.price : ci.original, original: ci.original, percent: ci.active ? ci.percent : 0,
      save: ci.active ? ci.save : 0, combo: ci.items.map((p) => p.name), options: ''
    };
  }
  const p = byId[k.id];
  if (!p) return null;
  const groups = optionsOf(p);
  if (groups.length !== k.picks.length) return null;
  let image = p.image;
  const labels = [];
  for (let i = 0; i < groups.length; i++) {
    const v = groups[i].values.find((x) => x.label === k.picks[i]);
    if (!v) return null;
    if (v.image) image = v.image;
    labels.push(groups[i].name + ': ' + v.label);
  }
  const o = offerInfo(p);
  return {
    name: p.name, sub: labels.join(', '), image, price: o.price, original: o.original,
    percent: o.percent, save: o.save, combo: null, options: labels.join(', '), productId: p.id
  };
}

/* ---------- basket ---------- */

const drawer = $('drawer'), scrim = $('scrim'), list = $('basket-list'), empty = $('basket-empty');
const send = $('basket-send'), noteEl = $('basket-note'), floating = $('basket-open');
const hint = $('order-hint'), msg = $('order-msg');
let opener = floating;

// The saved basket can arrive before the product list. Until the list is loaded, keep every
// basket entry as is and only show the ones we can already describe.
let catalogReady = false;
const known = () => Object.keys(cart).filter((k) => cart[k] > 0 && describe(k));

function total() { return known().reduce((a, k) => a + cart[k], 0); }

function itemNote(k) { return String(itemNotes[k] || '').trim(); }

function totals() {
  let sum = 0, save = 0, unpriced = 0;
  known().forEach((k) => {
    const d = describe(k);
    if (d.price) { sum += d.price * cart[k]; save += d.save * cart[k]; } else unpriced++;
  });
  return { sum, save, unpriced };
}

function waText(code) {
  const lines = known().map((k) => {
    const d = describe(k);
    const price = d.price ? ' @ ' + fmtPrice(d.price) + (d.percent ? ' (' + d.percent + '% off ' + fmtPrice(d.original) + ')' : '') : '';
    return '- ' + cart[k] + ' x ' + (d.combo ? 'Combo: ' : '') + d.name + price +
      (d.sub ? '\n  ' + d.sub : '') + (itemNote(k) ? '\n  Note: ' + itemNote(k) : '');
  });
  let text = 'Hi LoopLove! I would like to order' + (code ? ' (' + code + ')' : '') + ':\n' + lines.join('\n');
  const t = totals();
  if (t.sum) text += '\n\nItems total: ' + fmtPrice(t.sum) + (t.unpriced ? ' plus items to be priced' : '') + (t.save ? ' (you save ' + fmtPrice(t.save) + ')' : '');
  text += '\nDelivery: LoopLove will send normal and fast delivery charges to accept';
  if (note.trim()) text += '\n\nNote: ' + note.trim();
  return text;
}

const lines = new Map();
let itemNoteTimer;

function makeLine(key) {
  const d = describe(key);
  const li = el('li', 'line');
  const img = el('img');
  img.alt = '';
  lazyImage(img, d.image);
  const q = el('span', 'qty');
  const minus = el('button', '', '−');
  minus.setAttribute('aria-label', 'One less ' + d.name);
  const plus = el('button', '', '+');
  plus.setAttribute('aria-label', 'One more ' + d.name);
  minus.addEventListener('click', () => change(key, -1));
  plus.addEventListener('click', () => change(key, 1));
  const count = el('span');
  q.append(minus, count, plus);
  const input = el('input', 'line-note');
  input.type = 'text';
  input.maxLength = 200;
  input.placeholder = d.combo ? 'Note for this combo: colours, size…' : 'Note for this item: size, gift message…';
  input.setAttribute('aria-label', 'Note for ' + d.name);
  input.addEventListener('input', () => {
    itemNotes[key] = input.value;
    clearTimeout(itemNoteTimer);
    itemNoteTimer = setTimeout(saveCart, 600);
  });
  const name = el('span', 'line-name', (d.combo ? 'Combo: ' : '') + d.name);
  if (d.sub) name.append(el('span', 'line-sub', d.sub));
  const priceEl = el('span', 'line-price');
  name.append(priceEl);
  li.append(img, name, q, input);
  list.append(li);
  const rec = { li, count, input, priceEl };
  lines.set(key, rec);
  return rec;
}

function renderCart() {
  if (catalogReady) {
    Object.keys(cart).forEach((k) => { if (!(cart[k] > 0) || !describe(k)) delete cart[k]; });
    Object.keys(itemNotes).forEach((k) => { if (!cart[k]) delete itemNotes[k]; });
  }
  const keys = known();
  lines.forEach((rec, k) => { if (!keys.includes(k)) { rec.li.remove(); lines.delete(k); } });
  keys.forEach((k) => {
    const rec = lines.get(k) || makeLine(k);
    rec.count.textContent = cart[k];
    const d = describe(k);
    rec.priceEl.replaceChildren();
    if (d.price) {
      rec.priceEl.append(fmtPrice(d.price * cart[k]));
      if (d.percent) rec.priceEl.append(' ', el('s', '', fmtPrice(d.original * cart[k])), ' ', el('span', 'line-off', d.percent + '% off'));
    } else {
      rec.priceEl.append('Price confirmed on WhatsApp');
    }
    if (document.activeElement !== rec.input) rec.input.value = itemNotes[k] || '';
  });
  const t = totals();
  const totalEl = $('basket-total');
  totalEl.replaceChildren();
  if (t.sum) {
    totalEl.append(el('span', '', 'Items total'), el('strong', '', fmtPrice(t.sum)));
    if (t.unpriced) totalEl.append(el('small', '', 'plus ' + t.unpriced + (t.unpriced === 1 ? ' item' : ' items') + ' priced on WhatsApp'));
    if (t.save) totalEl.append(el('small', 'save', 'You save ' + fmtPrice(t.save)));
    totalEl.append(el('small', '', 'Delivery is added after you order.'));
  }
  const n = total();
  $('delivery-note').hidden = n === 0;
  document.querySelectorAll('.basket-count').forEach((c) => { c.textContent = n; });
  empty.hidden = n > 0;
  send.disabled = n === 0;
  if (document.activeElement !== noteEl) noteEl.value = note;
  Object.keys(controls).forEach(syncControl);
  renderHint();
  if (pd.open) syncDetailCount();
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
  Object.keys(cart).forEach((k) => { if (itemNotes[k]) notes[k] = String(itemNotes[k]).slice(0, 200); });
  return setDoc(doc(db, 'carts', user.uid), { items: cart, itemNotes: notes, note, updatedAt: serverTimestamp() })
    .catch((e) => { console.error(e); msg.textContent = "Couldn't save your basket. Check your connection."; });
}

function change(key, d, after) {
  if (!user) { requireLogin(() => change(key, d, after)); return; }
  cart[key] = (cart[key] || 0) + d;
  if (cart[key] <= 0) delete cart[key];
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

/* ---------- product page ---------- */

const pd = $('pd');
let pdState = null;
let pdPushed = false;
let pdFromPop = false;

function openDetail(id, push = true) {
  const p = byId[id];
  if (!shown(p)) return;
  const groups = optionsOf(p);
  pdState = { p, groups, picks: groups.map((g) => g.values[0].label), qty: 1 };
  renderDetail();
  if (!pd.open) {
    pd.showModal();
    if (F.lenis) F.lenis.stop();
  }
  pd.scrollTop = 0;
  if (push && location.hash !== '#p/' + id) {
    history.pushState({ pd: id }, '', '#p/' + id);
    pdPushed = true;
  }
  $('pd-close').focus();
}

function pdImage(image) {
  const main = $('pd-img');
  if (main.dataset.image === image) return;
  main.dataset.image = image;
  main.removeAttribute('src');
  setImage(main, image);
  $('pd-thumbs').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.image === image));
}

function pickedImage() {
  const { p, groups, picks } = pdState;
  let image = p.image;
  groups.forEach((g, i) => { const v = g.values.find((x) => x.label === picks[i]); if (v && v.image) image = v.image; });
  return image;
}

function renderDetail() {
  const { p, groups } = pdState;
  const sec = sections.find((s) => s.id === p.sectionId);
  $('pd-sec').textContent = sec ? sec.title : '';
  $('pd-name').textContent = p.name;
  $('pd-desc').textContent = p.description || '';
  $('pd-desc').hidden = !p.description;

  const imgs = [p.image];
  groups.forEach((g) => g.values.forEach((v) => { if (v.image && !imgs.includes(v.image)) imgs.push(v.image); }));
  const thumbs = $('pd-thumbs');
  thumbs.replaceChildren();
  if (imgs.length > 1) {
    imgs.forEach((image, i) => {
      const b = el('button', 'pd-thumb');
      b.type = 'button';
      b.dataset.image = image;
      b.setAttribute('aria-label', 'Photo ' + (i + 1) + ' of ' + imgs.length);
      const t = el('img');
      t.alt = '';
      lazyImage(t, image, true);
      b.append(t);
      b.addEventListener('click', () => pdImage(image));
      thumbs.append(b);
    });
  }
  $('pd-img').alt = p.name;
  $('pd-img').dataset.image = '';
  pdImage(pickedImage());

  const o = offerInfo(p);
  const price = $('pd-price');
  price.replaceChildren();
  if (o.price) {
    price.append(el('strong', '', fmtPrice(o.price)));
    if (o.active) {
      price.append(el('s', '', fmtPrice(o.original)), el('span', 'pd-off', o.percent + '% off'));
      const t = el('span', 'pd-timer', timeLeft(o.endsAt - Date.now()));
      t.dataset.ends = o.endsAt;
      price.append(t);
    }
  } else price.append(el('span', 'pd-ask', 'Price confirmed on WhatsApp'));

  const opts = $('pd-opts');
  opts.replaceChildren();
  groups.forEach((g, gi) => {
    const fs = el('fieldset', 'pd-group');
    const lg = el('legend');
    const chosen = el('span', 'pd-chosen');
    lg.append(g.name + ': ', chosen);
    fs.append(lg);
    const row = el('div', 'pd-chips');
    g.values.forEach((v) => {
      const b = el('button', 'pd-chip' + (v.image ? ' has-img' : ''));
      b.type = 'button';
      b.dataset.label = v.label;
      if (v.image) {
        const t = el('img');
        t.alt = '';
        lazyImage(t, v.image, true);
        b.append(t);
      }
      b.append(el('span', '', v.label));
      b.addEventListener('click', () => {
        pdState.picks[gi] = v.label;
        syncPicks();
        if (v.image) pdImage(v.image); else pdImage(pickedImage());
      });
      row.append(b);
    });
    fs.append(row);
    opts.append(fs);
  });
  syncPicks();

  const deals = $('pd-combos');
  deals.replaceChildren();
  const mine = combos.filter((c) => (c.productIds || []).includes(p.id) && comboInfo(c, byId).active);
  if (mine.length) {
    deals.append(el('h3', '', 'Save more in a combo'));
    mine.forEach((c) => {
      const ci = comboInfo(c, byId);
      const card = el('div', 'pd-combo');
      const pics = el('div', 'pd-combo-pics');
      ci.items.slice(0, 3).forEach((x) => { const i = el('img'); i.alt = ''; lazyImage(i, x.image, true); pics.append(i); });
      const info = el('div');
      info.append(el('p', 'pd-combo-name', ci.name));
      const pr = el('p', 'pd-combo-price');
      pr.append(el('strong', '', fmtPrice(ci.price)), ' ', el('s', '', fmtPrice(ci.original)), ' ', el('span', 'pd-off', ci.percent + '% off'));
      info.append(pr);
      card.append(pics, info);
      mountControl(card, 'combo:' + c.id, ci.name);
      deals.append(card);
    });
  }
  $('pd-ask').href = waLink('Hi LoopLove! A question about ' + p.name + ': ');
  $('pd-msg').replaceChildren();
  syncQty();
}

function syncPicks() {
  const { groups, picks } = pdState;
  $('pd-opts').querySelectorAll('.pd-group').forEach((fs, gi) => {
    fs.querySelector('.pd-chosen').textContent = picks[gi];
    fs.querySelectorAll('.pd-chip').forEach((b) => b.setAttribute('aria-pressed', b.dataset.label === picks[gi]));
  });
  if (groups.length) $('pd-msg').replaceChildren();
  syncDetailCount();
}

function pdKey() { return variantKey(pdState.p.id, pdState.groups.length ? pdState.picks : null); }

function syncQty() {
  const o = offerInfo(pdState.p);
  $('pd-n').textContent = pdState.qty;
  $('pd-add').textContent = 'Add to basket' + (o.price ? ' · ' + fmtPrice(o.price * pdState.qty) : '');
}

function syncDetailCount() {
  const n = cart[pdKey()] || 0;
  $('pd-in').textContent = n ? n + ' already in your basket' + (pdState.groups.length ? ' with these options' : '') : '';
}

$('pd-minus').addEventListener('click', () => { pdState.qty = Math.max(1, pdState.qty - 1); syncQty(); });
$('pd-plus').addEventListener('click', () => { pdState.qty = Math.min(20, pdState.qty + 1); syncQty(); });
$('pd-add').addEventListener('click', () => {
  const key = pdKey(), qty = pdState.qty;
  change(key, qty, () => {
    const m = $('pd-msg');
    m.replaceChildren(el('span', '', 'Added ' + qty + ' to your basket. '));
    const b = el('button', 'link', 'View basket');
    b.type = 'button';
    b.addEventListener('click', () => { pd.close(); opener = floating; openDrawer(); });
    m.append(b);
    pdState.qty = 1;
    syncQty();
  });
});
$('pd-close').addEventListener('click', () => pd.close());
pd.addEventListener('click', (e) => { if (e.target === pd) pd.close(); });
pd.addEventListener('close', () => {
  if (F.lenis && !drawer.classList.contains('open')) F.lenis.start();
  if (pdFromPop) { pdFromPop = false; return; }
  if (location.hash.startsWith('#p/')) {
    if (pdPushed) history.back();
    else history.replaceState(null, '', location.pathname + location.search);
  }
  pdPushed = false;
});
addEventListener('popstate', () => {
  if (location.hash.startsWith('#p/')) { if (catalogReady) openDetail(location.hash.slice(3), false); }
  else if (pd.open) { pdFromPop = true; pdPushed = false; pd.close(); }
});

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
    const items = known().map((k) => {
      const d = describe(k);
      return {
        id: k, name: d.name, qty: cart[k], price: d.price || null,
        originalPrice: d.percent ? d.original : null, offerPercent: d.percent || null,
        options: d.options || null, combo: d.combo || null,
        note: itemNote(k).slice(0, 200)
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
    send.textContent = 'Place order';
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
  $('orders-link').hidden = !u;
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
      lines.forEach((rec, k) => { if (rec.input === document.activeElement) typing = [k, rec.input.value]; });
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

$('foot-wa').href = waLink('Hi LoopLove!');
$('foot-ig').href = INSTAGRAM;

async function boot() {
  try {
    const cat = await loadCatalog();
    F.catalogFromCache = cat.fromCache;
    sections = cat.sections.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.visible !== false);
    products = cat.products.docs.map((d) => ({ id: d.id, ...d.data() }));
    combos = cat.combos ? cat.combos.docs.map((d) => ({ id: d.id, ...d.data() })) : [];
    byId = Object.fromEntries(products.map((x) => [x.id, x]));
    comboById = Object.fromEntries(combos.map((x) => [x.id, x]));
    catalogReady = true;
  } catch (e) {
    console.error(e);
    $('sections').replaceChildren(el('p', 'loading wrap', "Couldn't load the shop. Check your connection and refresh."));
    return;
  }
  renderHero();
  renderSections();
  renderCart();
  if (location.hash.startsWith('#p/')) openDetail(location.hash.slice(3), false);
  await cartReady;
  let after = '';
  try { after = sessionStorage.getItem('fingo-after-login') || ''; sessionStorage.removeItem('fingo-after-login'); } catch (e) {}
  if (location.hash === '#checkout' || (after === 'basket' && user)) {
    const back = location.hash === '#checkout';
    history.replaceState(null, '', location.pathname);
    openDrawer();
    if (back && total()) {
      msg.textContent = 'Details saved. Tap Place order to finish.';
      msg.classList.add('ok');
    }
  }
}
boot();
