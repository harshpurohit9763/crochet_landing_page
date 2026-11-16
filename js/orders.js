import { db, auth, WHATSAPP, googleSignIn, orderCode, fmtDate, fmtPrice, el, deliveryState, DELIVERY_NAMES, ask, tell, parseKey, stars } from './firebase-shared.js?v=24';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { collection, query, where, onSnapshot, doc, updateDoc, setDoc, deleteDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

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
  new: "Got it! We'll confirm your order soon.",
  confirmed: "Confirmed! Your yarn is picked out and ready to go. We'll share payment details for delivery on WhatsApp.",
  making: 'Your piece is on the hook right now, loop by loop.',
  shipped: 'Packed with love and on its way to you.',
  delivered: 'Delivered. We hope it makes you smile!',
  cancelled: "This order was cancelled. Message us if that's unexpected."
};

let unsub = null;
let unsubReviews = null;
let rows = [];
let myReviews = {};
const openForms = new Set();
const seen = new Set();

$('o-signin').addEventListener('click', async () => {
  $('o-gate-msg').textContent = '';
  try { await googleSignIn(); } catch (e) { console.error(e); $('o-gate-msg').textContent = "Couldn't sign in with Google. Try again."; }
});

onAuthStateChanged(auth, (u) => {
  if (unsub) { unsub(); unsub = null; }
  if (unsubReviews) { unsubReviews(); unsubReviews = null; }
  myReviews = {};
  rows = [];
  $('o-email').textContent = u ? u.email : '';
  $('o-gate').hidden = !!u;
  $('o-app').hidden = !u;
  if (!u) return;
  const list = $('o-list');
  list.replaceChildren(el('p', 'muted', 'Loading your orders…'));
  unsubReviews = onSnapshot(query(collection(db, 'reviews'), where('uid', '==', u.uid)), (snap) => {
    myReviews = Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
    if (rows.length) render();
  }, (e) => console.error(e));
  unsub = onSnapshot(query(collection(db, 'orders'), where('uid', '==', u.uid)), (snap) => {
    rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => ((b.createdAt && b.createdAt.seconds) || 0) - ((a.createdAt && a.createdAt.seconds) || 0));
    render();
  }, (e) => {
    console.error(e);
    list.replaceChildren(el('p', 'error', "Couldn't load your orders. Check your connection and refresh."));
  });
});

function render() {
  const list = $('o-list');
  {
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
  }
}

// Inline review for one product of a delivered order: stars, a few words, post or edit.
function reviewBox(o, i, pid) {
  const id = o.id + '_' + pid;
  const mine = myReviews[id];
  const box = el('div', 'o-review');
  if (mine && !openForms.has(id)) {
    const line = el('p', 'o-review-done');
    line.append(el('span', 'stars', stars(mine.rating)), ' ', el('span', '', mine.text ? '“' + mine.text + '”' : 'Rated'));
    const edit = el('button', 'link', 'Edit');
    edit.type = 'button';
    edit.addEventListener('click', () => { openForms.add(id); render(); });
    box.append(line, edit);
    return box;
  }
  if (!openForms.has(id)) {
    const b = el('button', 'o-rate', 'Rate and review');
    b.type = 'button';
    b.addEventListener('click', () => { openForms.add(id); render(); });
    box.append(b);
    return box;
  }
  let rating = mine ? mine.rating : 0;
  const form = el('form', 'o-review-form');
  const pick = el('div', 'o-stars');
  pick.setAttribute('role', 'radiogroup');
  pick.setAttribute('aria-label', 'Your rating');
  const hint = el('span', 'o-stars-hint');
  const WORDS = ['', 'Not for me', 'Okay', 'Good', 'Really nice', 'Loved it!'];
  const btns = [1, 2, 3, 4, 5].map((n) => {
    const s = el('button', 'o-star', '★');
    s.type = 'button';
    s.setAttribute('role', 'radio');
    s.setAttribute('aria-label', n + (n === 1 ? ' star' : ' stars'));
    s.addEventListener('click', () => { rating = n; sync(); });
    pick.append(s);
    return s;
  });
  const sync = () => {
    btns.forEach((s, k) => { s.classList.toggle('on', k < rating); s.setAttribute('aria-checked', k + 1 === rating); });
    hint.textContent = WORDS[rating] || 'Tap a star';
  };
  pick.append(hint);
  const ta = el('textarea');
  ta.rows = 3;
  ta.maxLength = 1000;
  ta.placeholder = 'How do you like it? Colour, size, how it looks…';
  ta.value = mine ? mine.text || '' : '';
  ta.setAttribute('aria-label', 'Your review of ' + i.name);
  const err = el('p', 'error');
  const row = el('div', 'o-review-actions');
  const post = el('button', 'btn solid', mine ? 'Save review' : 'Post review');
  post.type = 'submit';
  const cancel = el('button', 'link', 'Cancel');
  cancel.type = 'button';
  cancel.addEventListener('click', () => { openForms.delete(id); render(); });
  row.append(post, cancel);
  if (mine) {
    const del = el('button', 'link o-cancel', 'Delete review');
    del.type = 'button';
    del.addEventListener('click', async () => {
      if (!await ask('Your review of ' + i.name + ' will be removed.', { title: 'Delete your review?', ok: 'Delete', cancel: 'Keep it', danger: true })) return;
      try { await deleteDoc(doc(db, 'reviews', id)); openForms.delete(id); render(); } catch (e) { console.error(e); tell("Couldn't delete your review. Try again."); }
    });
    row.append(del);
  }
  form.append(pick, ta, err, row);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!rating) { err.textContent = 'Tap the stars to rate it.'; return; }
    post.disabled = true;
    try {
      await setDoc(doc(db, 'reviews', id), {
        uid: o.uid, orderId: o.id, productId: pid,
        name: String((o.customer && o.customer.name) || 'Customer').split(' ')[0].slice(0, 40),
        rating, text: ta.value.trim().slice(0, 1000), options: i.options || '',
        createdAt: mine && mine.createdAt ? mine.createdAt : serverTimestamp(), updatedAt: serverTimestamp()
      });
      openForms.delete(id);
      render();
    } catch (e2) { console.error(e2); post.disabled = false; err.textContent = "Couldn't post your review. Check your connection and try again."; }
  });
  sync();
  box.append(form);
  return box;
}

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

// The customer picks normal or fast delivery and accepts it; only then can we confirm the order.
function quoteBox(o, sum) {
  const box = el('div', 'o-quote');
  box.append(el('h3', '', 'Choose your delivery'));
  const opts = el('div', 'o-quote-opts');
  const choices = [['normal', o.delivery.normal], ['fast', o.delivery.fast]].filter(([, v]) => typeof v === 'number');
  let pick = choices[0][0];
  const total = el('p', 'o-quote-total');
  const accept = el('button', 'btn solid', '');
  accept.type = 'button';
  const sync = () => {
    const v = o.delivery[pick];
    total.replaceChildren('Items ' + fmtPrice(sum) + ' + ' + DELIVERY_NAMES[pick].toLowerCase() + ' ' + (v ? fmtPrice(v) : 'free') + ' = ', el('strong', '', fmtPrice(sum + v)));
    accept.textContent = 'Accept ' + DELIVERY_NAMES[pick].toLowerCase() + ' and confirm';
  };
  choices.forEach(([k, v]) => {
    const lab = el('label', 'o-opt');
    const r = el('input');
    r.type = 'radio';
    r.name = 'dl-' + o.id;
    r.value = k;
    r.checked = k === pick;
    r.addEventListener('change', () => { pick = k; sync(); });
    const t = el('span', 'o-opt-text');
    t.append(el('strong', '', DELIVERY_NAMES[k]), el('span', '', k === 'fast' ? 'Reaches you sooner' : 'Our usual courier'));
    lab.append(r, t, el('span', 'o-opt-price', v ? fmtPrice(v) : 'Free'));
    opts.append(lab);
  });
  const warn = el('p', 'o-nonref');
  warn.append(el('strong', '', 'Delivery charges are non-refundable.'), ' Accepting confirms your order, and the delivery charge has to be paid. We share payment details on WhatsApp.');
  const err = el('p', 'error');
  accept.addEventListener('click', async () => {
    accept.disabled = true;
    err.textContent = '';
    try {
      await updateDoc(doc(db, 'orders', o.id), {
        deliveryChoice: pick, deliveryCharge: o.delivery[pick], customerConfirmed: true,
        customerConfirmedAt: serverTimestamp(), status: 'confirmed', 'statusTimes.confirmed': serverTimestamp(), updatedAt: serverTimestamp()
      });
    } catch (e) { console.error(e); accept.disabled = false; err.textContent = "Couldn't save your choice. Check your connection and try again."; }
  });
  sync();
  box.append(opts, total, warn, accept, err);
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
  const state = deliveryState(o);
  let said = SAY[o.status] || '';
  if (o.status === 'new') {
    if (state === 'none') said = "Got it! We're working out delivery to your address. You'll pick Normal or Fast delivery here soon.";
    if (state === 'quoted') said = 'Your delivery options are ready. Pick one below to confirm your order.';
    if (state === 'accepted') said = 'Thanks! You chose ' + (DELIVERY_NAMES[o.deliveryChoice] || 'delivery').toLowerCase() + ". We'll share payment details on WhatsApp and confirm your order.";
  }
  if (o.status === 'cancelled' && o.cancelledBy === 'customer') said = 'You cancelled this order.';
  li.append(el('p', 'o-say s-' + o.status + (o.status === 'new' && state === 'quoted' ? ' s-action' : ''), said));

  const items = el('ul', 'o-items');
  let sum = 0, unpriced = 0, saved = 0;
  const reviewed = new Set();
  (o.items || []).forEach((i) => {
    const row = el('li');
    const left = el('div');
    left.append(el('span', 'o-item-name', i.qty + ' x ' + i.name));
    if (i.options) left.append(el('span', 'o-item-opt', i.options));
    if (i.combo && i.combo.length) left.append(el('span', 'o-item-opt', 'Combo: ' + i.combo.join(' + ')));
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
    const k = parseKey(String(i.id || ''));
    if (o.status === 'delivered' && !k.combo && k.id && !reviewed.has(k.id)) {
      reviewed.add(k.id);
      const r = el('li', 'o-review-row');
      r.append(reviewBox(o, i, k.id));
      items.append(r);
    }
  });
  li.append(items);
  if (o.note) li.append(el('p', 'o-note', 'Note: ' + o.note));

  const hasDelivery = typeof o.deliveryCharge === 'number';
  const totals = el('dl', 'o-totals');
  const row = (k, v, cls) => { const d = el('div', cls || ''); d.append(el('dt', '', k), el('dd', '', v)); totals.append(d); };
  row('Items', sum ? fmtPrice(sum) + (unpriced ? ' + priced on WhatsApp' : '') : 'Priced on WhatsApp');
  if (saved) row('You saved', fmtPrice(saved), 'saved');
  const dname = o.deliveryChoice === 'fast' ? 'Fast delivery' : 'Delivery';
  row(dname, hasDelivery ? (o.deliveryCharge === 0 ? 'Free' : fmtPrice(o.deliveryCharge)) : state === 'quoted' ? 'Choose below' : 'Added soon', hasDelivery ? '' : 'pending');
  if (sum) row('Total', fmtPrice(sum + (hasDelivery ? o.deliveryCharge : 0)) + (hasDelivery ? '' : ' + delivery'), 'grand');
  li.append(totals);
  if (o.status === 'new' && state === 'quoted') li.append(quoteBox(o, sum));
  if (o.status === 'new' && ['none', 'quoted', 'legacy'].includes(state)) {
    const cancel = el('button', 'link o-cancel', 'Cancel this order');
    cancel.type = 'button';
    cancel.addEventListener('click', async () => {
      if (!await ask('Your order ' + code + ' will be cancelled. This cannot be undone.', { title: 'Cancel this order?', ok: 'Yes, cancel it', cancel: 'Keep my order', danger: true })) return;
      cancel.disabled = true;
      try {
        await updateDoc(doc(db, 'orders', o.id), { status: 'cancelled', cancelledBy: 'customer', 'statusTimes.cancelled': serverTimestamp(), updatedAt: serverTimestamp() });
      } catch (e) { console.error(e); cancel.disabled = false; tell("Couldn't cancel. Check your connection and try again."); }
    });
    li.append(cancel);
  }

  const ask = el('a', 'link o-ask', 'Ask about this order on WhatsApp');
  ask.href = 'https://api.whatsapp.com/send?phone=' + WHATSAPP + '&text=' + encodeURIComponent('Hi LoopLove! A question about my order ' + code + ': ');
  ask.target = '_blank';
  ask.rel = 'noopener';
  li.append(ask);
  return li;
}
