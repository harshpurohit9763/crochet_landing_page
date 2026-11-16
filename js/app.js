import {
  db, auth, WHATSAPP, INSTAGRAM, HERO_COLORS, orderCode, googleSignIn, getProfile, setImage, el,
  stars, ask, tell, fmtDate, fmtPrice, offerInfo, choiceOffer, lowestPrice, comboInfo, optionsOf, variantKey, parseKey, timeLeft, markLoading, loadCatalog
} from './firebase-shared.js?v=23';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  collection, doc, onSnapshot, setDoc, addDoc, serverTimestamp, query, where, getDocs, deleteDoc
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

function priceTag(p, cls, picks) {
  const low = lowestPrice(p);
  const from = !picks && (!!(low && Number(p.price) > 0 && low < Number(p.price)) || (!(Number(p.price) > 0) && !!low));
  const o = picks ? choiceOffer(p, picks) : offerInfo(from ? { ...p, price: low } : p);
  if (!o.price) return null;
  const t = el('span', 'price-tag' + (o.active ? ' has-offer' : '') + (cls ? ' ' + cls : ''));
  if (from) t.append(el('span', 'pt-from', 'from'));
  if (o.active) {
    t.append(el('span', 'pt-now', fmtPrice(o.price)), el('s', 'pt-was', fmtPrice(o.original)), el('span', 'pt-off', o.percent + '% off'));
    t.setAttribute('aria-label', 'Now ' + o.price + ' rupees, was ' + o.original + ', ' + o.percent + ' percent off');
  } else {
    t.append(fmtPrice(o.price));
    t.setAttribute('aria-label', (from ? 'From ' : 'Price ') + o.price + ' rupees');
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
  box.addEventListener('click', (e) => {
    if (e.target.closest('.ctl, .price-tag button, .sl-nav, .sl-dots')) return;
    openDetail(p.id, true, box.slidePicks ? box.slidePicks() : null);
  });
}

/* ---------- tile photo carousel ---------- */

// The main photo plus every colour or design choice that has its own photo, without repeats.
function tileSlides(p) {
  const groups = optionsOf(p);
  const base = groups.map((g) => g.values[0].label);
  const seen = new Set();
  const out = [];
  const add = (image, label, picks) => {
    if (!image || seen.has(image)) return;
    seen.add(image);
    out.push({ image, label, picks });
  };
  add(p.image, groups.length ? groups[0].values[0].label : '', base);
  groups.forEach((g, gi) => g.values.forEach((v) => {
    const picks = base.slice();
    picks[gi] = v.label;
    add(v.image, v.label, picks);
  }));
  return out;
}

// Puts the product photo into a tile. With 2+ photos it becomes a swipeable carousel with arrows and dots.
function tilePhotos(host, p, { eager = false } = {}) {
  const slides = tileSlides(p);
  if (slides.length < 2) {
    const img = el('img');
    img.alt = p.name;
    img.loading = 'lazy';
    img.draggable = false;
    lazyImage(img, p.image, eager);
    host.append(img);
    return;
  }
  host.classList.add('has-slides');
  const track = el('div', 'sl-track');
  const imgs = slides.map((sl) => {
    const img = el('img');
    img.alt = p.name + (sl.label ? ', ' + sl.label : '');
    img.draggable = false;
    track.append(img);
    return img;
  });
  lazyImage(imgs[0], slides[0].image, eager);
  // The other photos load once the tile is near the screen.
  const io = new IntersectionObserver((es) => {
    if (!es[0].isIntersecting) return;
    io.disconnect();
    slides.slice(1).forEach((sl, i) => setImage(imgs[i + 1], sl.image));
  }, { rootMargin: '300px' });
  io.observe(host);

  const prev = el('button', 'sl-nav sl-prev', '‹');
  const next = el('button', 'sl-nav sl-next', '›');
  prev.type = next.type = 'button';
  prev.setAttribute('aria-label', 'Previous photo of ' + p.name);
  next.setAttribute('aria-label', 'Next photo of ' + p.name);
  const dots = el('div', 'sl-dots');
  const dotBtns = slides.map((sl, i) => {
    const d = el('button', 'sl-dot');
    d.type = 'button';
    d.setAttribute('aria-label', 'Photo ' + (i + 1) + ' of ' + slides.length + (sl.label ? ': ' + sl.label : ''));
    d.addEventListener('click', () => go(i));
    dots.append(d);
    return d;
  });

  let cur = -1;
  function mark(i) {
    if (i === cur) return;
    cur = i;
    dotBtns.forEach((d, j) => d.setAttribute('aria-current', j === i ? 'true' : 'false'));
    prev.disabled = i === 0;
    next.disabled = i === slides.length - 1;
    host.dispatchEvent(new CustomEvent('slide'));
  }
  function go(i) {
    i = Math.max(0, Math.min(slides.length - 1, i));
    track.scrollTo({ left: i * track.clientWidth, behavior: reduced ? 'auto' : 'smooth' });
    mark(i);
  }
  prev.addEventListener('click', () => go(cur - 1));
  next.addEventListener('click', () => go(cur + 1));
  let raf = 0;
  track.addEventListener('scroll', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => mark(Math.round(track.scrollLeft / Math.max(1, track.clientWidth))));
  }, { passive: true });
  host.slidePicks = () => slides[Math.max(cur, 0)].picks;
  host.slideAll = slides.map((sl) => sl.picks);
  mark(0);
  host.append(track, prev, next, dots);
}

/* ---------- add / quantity control ---------- */

function mountControl(row, key, label, allKeys) {
  const keyOf = typeof key === 'function' ? key : () => key;
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
  add.addEventListener('click', () => change(keyOf(), 1, () => plus.focus()));
  plus.addEventListener('click', () => change(keyOf(), 1));
  minus.addEventListener('click', () => change(keyOf(), -1, () => { if (!cart[keyOf()]) add.focus(); }));
  row.append(box);
  const entry = { add, stepper, n, minus, plus, keyOf };
  (allKeys || [key]).forEach((k) => (controls[k] = controls[k] || []).push(entry));
  syncEntry(entry);
  box.sync = () => syncEntry(entry);
  box.relabel = (text) => {
    add.setAttribute('aria-label', 'Add ' + text + ' to basket');
    minus.setAttribute('aria-label', 'Remove one ' + text);
    plus.setAttribute('aria-label', 'Add one more ' + text);
  };
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

function syncEntry(c) {
  const n = cart[c.keyOf()] || 0;
  c.add.hidden = n > 0;
  c.stepper.hidden = n === 0;
  c.n.textContent = n;
}
function syncControl(key) {
  (controls[key] || []).forEach(syncEntry);
}

// Tile buy row. For a product whose design photos swipe in the tile, Add buys the design on
// screen, the price tag shows that design's price and its name sits under the product name.
function tileBuy(p, host, row, nameEl, tagSpot) {
  if (!host.slideAll || !optionsOf(p).length) {
    if (tagSpot) { const t = priceTag(p, tagSpot.cls); if (t) tagSpot.parent.append(t); }
    productControl(row, p);
    return;
  }
  const picksNow = () => host.slidePicks();
  const keyNow = () => variantKey(p.id, picksNow());
  const keys = [...new Set(host.slideAll.map((pk) => variantKey(p.id, pk)))];
  const variant = el('span', 'pvar');
  nameEl.append(variant);
  const box = mountControl(row, keyNow, p.name, keys);
  let tag = null;
  const update = () => {
    const picks = picksNow();
    const label = picks.filter(Boolean).join(', ');
    variant.textContent = label;
    box.relabel(p.name + (label ? ', ' + label : ''));
    box.sync();
    if (tagSpot) {
      const t = priceTag(p, tagSpot.cls, picks);
      if (tag) tag.remove();
      tag = t;
      if (t) tagSpot.parent.append(t);
    }
    if (host.onVariant) host.onVariant(picks);
  };
  host.addEventListener('slide', update);
  update();
}

/* ---------- hero ---------- */

function renderHero() {
  const hero = $('top');
  let featured = products.filter((p) => p.featured && shown(p));
  if (!featured.length) featured = products.filter(shown).slice(0, 5);
  const pic = $('hero-pic'), big = $('hero-big'), name = $('hero-name'), tabs = $('hero-tabs'), ctlBox = $('hero-ctl');
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
    tabs.append(tab);
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
    tilePhotos(pic, p);
    detailClick(pic, p);
    const row = el('div', 'plant-row');
    const h = detailName('h3', p);
    row.append(h);
    tileBuy(p, pic, row, h, { parent: pic });
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
    tilePhotos(fig, p, { eager: true });
    detailClick(fig, p);
    const row = el('div', 'arch-row');
    const h = detailName('h3', p);
    row.append(h);
    tileBuy(p, fig, row, h, { parent: fig, cls: 'on-arch' });
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
    const ph = el('div', 'pin-pic');
    tilePhotos(ph, p);
    detailClick(ph, p);
    const cap = el('figcaption');
    const nm = detailName('span', p);
    cap.append(nm);
    f.append(ph, cap);
    tileBuy(p, ph, cap, nm, { parent: f });
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
  tilePhotos(pic, p);
  pic.append(el('span', 'coupon-stamp', o.percent + '%\nOFF'));
  detailClick(pic, p);
  const body = el('div', 'coupon-body');
  const price = el('p', 'coupon-price');
  const now = el('strong', '', fmtPrice(o.price)), was = el('s', '', fmtPrice(o.original));
  price.append(now, was);
  const save = el('p', 'coupon-save', 'You save ' + fmtPrice(o.save));
  pic.onVariant = (picks) => {
    const v = choiceOffer(p, picks);
    now.textContent = fmtPrice(v.price);
    was.textContent = fmtPrice(v.original);
    save.textContent = 'You save ' + fmtPrice(v.save);
  };
  const row = el('div', 'coupon-row');
  const h = detailName('h3', p);
  tileBuy(p, pic, row, h, null);
  body.append(h, price, save, couponTimer(o.endsAt), row);
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
  const o = choiceOffer(p, k.picks);
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

function openDetail(id, push = true, startPicks = null) {
  const p = byId[id];
  if (!shown(p)) return;
  const groups = optionsOf(p);
  const picks = groups.map((g, i) => (startPicks && g.values.some((v) => v.label === startPicks[i]) ? startPicks[i] : g.values[0].label));
  pdState = { p, groups, picks };
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

  // Every extra photo belongs to a colour or design choice, and the option chips below
  // already show and switch those photos, so there is no separate photo strip.
  $('pd-thumbs').replaceChildren();
  $('pd-img').alt = p.name;
  $('pd-img').dataset.image = '';
  pdImage(pickedImage());

  renderPdPrice();

  const opts = $('pd-opts');
  opts.replaceChildren();
  groups.forEach((g, gi) => {
    const fs = el('fieldset', 'pd-group');
    const lg = el('legend');
    const chosen = el('span', 'pd-chosen');
    lg.append(g.name + ': ', chosen);
    fs.append(lg);
    const row = el('div', 'pd-chips');
    g.values.forEach((v, vi) => {
      const vimg = v.image || (vi === 0 && g.values.some((x) => x.image) ? p.image : '');
      const b = el('button', 'pd-chip' + (vimg ? ' has-img' : ''));
      b.type = 'button';
      b.dataset.label = v.label;
      if (vimg) {
        const t = el('img');
        t.alt = '';
        lazyImage(t, vimg, true);
        b.append(t);
      }
      b.append(el('span', '', v.label));
      if (Number(v.price) > 0) b.append(el('small', 'pd-chip-price', fmtPrice(v.price)));
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
  loadReviews(p);
  $('pd-ask').href = waLink('Hi LoopLove! A question about ' + p.name + ': ');
  $('pd-msg').replaceChildren();
  syncQty();
}

// Reviews come from customers whose order with this product was delivered.
let reviewsFor = null;
async function loadReviews(p) {
  const box = $('pd-reviews');
  reviewsFor = p.id;
  box.hidden = true;
  box.replaceChildren();
  let list = [];
  try {
    const snap = await getDocs(query(collection(db, 'reviews'), where('productId', '==', p.id)));
    list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) { console.error(e); return; }
  if (reviewsFor !== p.id) return;
  list.sort((a, b) => ((b.updatedAt && b.updatedAt.seconds) || 0) - ((a.updatedAt && a.updatedAt.seconds) || 0));
  const head = el('div', 'pd-rev-head');
  const h = el('h3', '', 'Reviews');
  h.id = 'pd-reviews-title';
  head.append(h);
  if (list.length) {
    const avg = list.reduce((a, r) => a + r.rating, 0) / list.length;
    const sum = el('p', 'pd-rev-avg');
    sum.append(el('strong', '', avg.toFixed(1)), el('span', 'stars', stars(Math.floor(avg))), el('span', '', list.length + (list.length === 1 ? ' review' : ' reviews')));
    sum.setAttribute('aria-label', 'Rated ' + avg.toFixed(1) + ' out of 5 from ' + list.length + ' reviews');
    head.append(sum);
  }
  box.append(head);
  if (!list.length) {
    box.append(el('p', 'pd-rev-empty', 'No reviews yet. Customers can review it in Your orders once it reaches them.'));
  }
  const isAdmin = !!(profile && profile.role === 'admin');
  const ul = el('ul', 'pd-rev-list');
  list.slice(0, 30).forEach((r) => {
    const li = el('li', 'pd-rev');
    const top = el('div', 'pd-rev-top');
    const st = el('span', 'stars', stars(r.rating));
    st.setAttribute('aria-label', r.rating + ' out of 5');
    top.append(st, el('strong', '', r.name || 'Customer'), el('span', 'pd-rev-date', fmtDate(r.updatedAt || r.createdAt)));
    li.append(top);
    if (r.options) li.append(el('span', 'pd-rev-opt', r.options));
    if (r.text) li.append(el('p', '', r.text));
    li.append(el('span', 'pd-rev-verified', 'Verified buyer'));
    if (isAdmin) {
      const del = el('button', 'link pd-rev-del', 'Remove review');
      del.type = 'button';
      del.addEventListener('click', async () => {
        if (!await ask('This review by ' + (r.name || 'a customer') + ' will be removed from the shop.', { title: 'Remove this review?', ok: 'Remove', cancel: 'Keep it', danger: true })) return;
        try { await deleteDoc(doc(db, 'reviews', r.id)); loadReviews(p); } catch (e) { console.error(e); tell("Couldn't remove the review. Try again."); }
      });
      li.append(del);
    }
    ul.append(li);
  });
  box.append(ul);
  box.hidden = false;
}

function renderPdPrice() {
  const o = choiceOffer(pdState.p, pdState.picks);
  const price = $('pd-price');
  price.replaceChildren();
  if (!o.price) { price.append(el('span', 'pd-ask', 'Price confirmed on WhatsApp')); return; }
  price.append(el('strong', '', fmtPrice(o.price)));
  if (o.active) {
    price.append(el('s', '', fmtPrice(o.original)), el('span', 'pd-off', o.percent + '% off'));
    const t = el('span', 'pd-timer', timeLeft(o.endsAt - Date.now()));
    t.dataset.ends = o.endsAt;
    price.append(t);
  }
}

function syncPicks() {
  const { groups, picks } = pdState;
  $('pd-opts').querySelectorAll('.pd-group').forEach((fs, gi) => {
    fs.querySelector('.pd-chosen').textContent = picks[gi];
    fs.querySelectorAll('.pd-chip').forEach((b) => b.setAttribute('aria-pressed', b.dataset.label === picks[gi]));
  });
  if (groups.length) $('pd-msg').replaceChildren();
  renderPdPrice();
  syncQty();
  syncDetailCount();
}

function pdKey() { return variantKey(pdState.p.id, pdState.groups.length ? pdState.picks : null); }

// Before anything is added there is only the Add button. Once this choice is in the basket,
// the −/+ stepper shows the basket quantity and the button opens the basket.
function syncQty() {
  if (!pdState) return;
  const o = choiceOffer(pdState.p, pdState.picks);
  const n = cart[pdKey()] || 0;
  $('pd-qty').hidden = n === 0;
  $('pd-n').textContent = n;
  $('pd-plus').disabled = n >= 20;
  const add = $('pd-add');
  add.classList.toggle('in-basket', n > 0);
  add.textContent = n ? 'View basket · ' + fmtPrice((o.price || 0) * n) : 'Add to basket' + (o.price ? ' · ' + fmtPrice(o.price) : '');
  $('pd-in').textContent = n && pdState.groups.length ? 'In your basket with these options' : '';
}
function syncDetailCount() { syncQty(); }

$('pd-minus').addEventListener('click', () => change(pdKey(), -1, () => { syncQty(); if (!cart[pdKey()]) $('pd-add').focus(); }));
$('pd-plus').addEventListener('click', () => { if ((cart[pdKey()] || 0) < 20) change(pdKey(), 1, syncQty); });
$('pd-add').addEventListener('click', () => {
  if (cart[pdKey()]) { pd.close(); opener = floating; openDrawer(); return; }
  change(pdKey(), 1, () => { syncQty(); $('pd-plus').focus(); });
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
