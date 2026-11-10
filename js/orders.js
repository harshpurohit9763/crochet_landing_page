import { db, auth, WHATSAPP, googleSignIn, orderCode, fmtDate, fmtPrice, el } from './firebase-shared.js?v=17';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { collection, query, where, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const $ = (id) => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const STEPS = [
  ['new', 'Placed'],
  ['confirmed', 'Confirmed'],
  ['making', 'Crocheting'],
  ['shipped', 'On its way'],
  ['delivered', 'Delivered']
];
const SAY = {
  new: "Got it! We'll confirm your order and delivery charge soon.",
  confirmed: 'Confirmed. Your yarn is picked out and ready to go.',
  making: 'Your piece is on the hook right now, loop by loop.',
  shipped: 'Packed with love and on its way to you.',
  delivered: 'Delivered. We hope it makes you smile!',
  cancelled: "This order was cancelled. Message us if that's unexpected."
};

let unsub = null;
const seen = new Set();

$('o-signin').addEventListener('click', async () => {
  $('o-gate-msg').textContent = '';
  try { await googleSignIn(); } catch (e) { console.error(e); $('o-gate-msg').textContent = "Couldn't sign in with Google. Try again."; }
});

onAuthStateChanged(auth, (u) => {
  if (unsub) { unsub(); unsub = null; }
  $('o-email').textContent = u ? u.email : '';
  $('o-gate').hidden = !!u;
  $('o-app').hidden = !u;
  if (!u) return;
  const list = $('o-list');
  list.replaceChildren(el('p', 'muted', 'Loading your orders…'));
  unsub = onSnapshot(query(collection(db, 'orders'), where('uid', '==', u.uid)), (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => ((b.createdAt && b.createdAt.seconds) || 0) - ((a.createdAt && a.createdAt.seconds) || 0));
    list.replaceChildren();
    if (!rows.length) {
      const p = el('div', 'o-empty');
      p.append(el('p', '', "You haven't ordered yet. Your orders and their progress will show up here."));
      const a = el('a', 'btn solid', 'Go to the shop');
      a.href = 'index.html#sections';
      p.append(a);
      list.append(p);
      return;
    }
    rows.forEach((o) => list.append(card(o)));
  }, (e) => {
    console.error(e);
    list.replaceChildren(el('p', 'error', "Couldn't load your orders. Check your connection and refresh."));
  });
});

function tracker(o) {
  const cancelled = o.status === 'cancelled';
  const idx = Math.max(0, STEPS.findIndex((s) => s[0] === o.status));
  const p = cancelled ? 0 : idx / (STEPS.length - 1);
  const times = o.statusTimes || {};

  const box = el('div', 'track' + (cancelled ? ' is-cancelled' : '') + (o.status === 'delivered' ? ' is-done' : ''));
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', cancelled ? 'Order cancelled' : 'Order progress: ' + STEPS[idx][1] + ', step ' + (idx + 1) + ' of ' + STEPS.length);
  const line = el('div', 'track-line');
  const fill = el('div', 'track-fill');
  const ball = el('div', 'track-ball');
  line.append(fill, ball);
  const ol = el('ol', 'track-steps');
  STEPS.forEach(([key, label], i) => {
    const state = cancelled ? 'todo' : i < idx ? 'done' : i === idx ? 'now' : 'todo';
    const li = el('li', 'track-step ' + state);
    const t = key === 'new' ? o.createdAt : times[key];
    li.append(el('span', 'track-dot'), el('span', 'track-label', label), el('span', 'track-time', state === 'todo' ? '' : t ? fmtDate(t) : ''));
    ol.append(li);
  });
  box.append(line, ol);
  if (cancelled) box.append(el('span', 'track-stamp', 'Cancelled'));

  // Knit the line out and roll the yarn ball to the current step. Animate only the first time an order is drawn.
  const target = () => {
    fill.style.width = p * 100 + '%';
    ball.style.left = p * 100 + '%';
    ball.style.rotate = p * 1080 + 'deg';
  };
  if (reduced || seen.has(o.id + o.status)) { box.classList.add('no-anim'); target(); }
  else requestAnimationFrame(() => requestAnimationFrame(target));
  seen.add(o.id + o.status);
  return box;
}

function card(o) {
  const li = el('li', 'o-card');
  const code = orderCode(o.id);
  const head = el('div', 'o-head');
  const h = el('div');
  h.append(el('h2', '', code), el('p', 'muted', 'Placed ' + fmtDate(o.createdAt)));
  head.append(h);
  li.append(head, tracker(o));
  const say = el('p', 'o-say s-' + o.status, SAY[o.status] || '');
  li.append(say);

  const items = el('ul', 'o-items');
  let sum = 0, unpriced = 0, saved = 0;
  (o.items || []).forEach((i) => {
    const row = el('li');
    const left = el('div');
    left.append(el('span', 'o-item-name', i.qty + ' x ' + i.name));
    if (i.note) left.append(el('span', 'o-item-note', i.note));
    row.append(left);
    if (i.price) {
      sum += i.price * i.qty;
      const pr = el('span', 'o-item-price');
      const discounted = i.offerPercent && i.originalPrice > i.price;
      if (discounted) {
        saved += (i.originalPrice - i.price) * i.qty;
        const was = el('s', 'o-was', fmtPrice(i.originalPrice * i.qty));
        was.setAttribute('aria-label', 'Was ' + i.originalPrice * i.qty + ' rupees');
        const line = el('span', 'o-price-line');
        line.append(was, el('strong', 'o-now', fmtPrice(i.price * i.qty)));
        pr.append(line, el('small', 'o-off', i.offerPercent + '% off'));
      } else {
        pr.append(el('strong', 'o-now plain', fmtPrice(i.price * i.qty)));
      }
      row.append(pr);
    } else {
      unpriced++;
      row.append(el('span', 'o-item-price muted', 'On WhatsApp'));
    }
    items.append(row);
  });
  li.append(items);
  if (o.note) li.append(el('p', 'o-note', 'Note: ' + o.note));

  const hasDelivery = typeof o.deliveryCharge === 'number';
  const totals = el('dl', 'o-totals');
  const row = (k, v, cls) => { const d = el('div', cls || ''); d.append(el('dt', '', k), el('dd', '', v)); totals.append(d); };
  row('Items', sum ? fmtPrice(sum) + (unpriced ? ' + priced on WhatsApp' : '') : 'Priced on WhatsApp');
  if (saved) row('You saved', fmtPrice(saved), 'saved');
  row('Delivery', hasDelivery ? (o.deliveryCharge === 0 ? 'Free' : fmtPrice(o.deliveryCharge)) : 'Added after we confirm', hasDelivery ? '' : 'pending');
  if (sum) row('Total', fmtPrice(sum + (hasDelivery ? o.deliveryCharge : 0)) + (hasDelivery ? '' : ' + delivery'), 'grand');
  li.append(totals);

  const ask = el('a', 'link o-ask', 'Ask about this order on WhatsApp');
  ask.href = 'https://api.whatsapp.com/send?phone=' + WHATSAPP + '&text=' + encodeURIComponent('Hi Fingo! A question about my order ' + code + ': ');
  ask.target = '_blank';
  ask.rel = 'noopener';
  li.append(ask);
  return li;
}
