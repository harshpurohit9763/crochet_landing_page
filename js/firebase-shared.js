import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, getDocFromCache,
  getDocs, getDocsFromCache, collection, query, orderBy, setDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

// Public web config. Safe to ship: access is controlled by firestore.rules.
export const firebaseConfig = {
  apiKey: 'AIzaSyByGq8GGG4vOR9kloKWa7Uoz61DHjCZZQ8',
  authDomain: 'crochetlandingpage.firebaseapp.com',
  projectId: 'crochetlandingpage',
  storageBucket: 'crochetlandingpage.firebasestorage.app',
  messagingSenderId: '25053424852',
  appId: '1:25053424852:web:fbc1d740506bd6226e9f41',
  measurementId: 'G-7GWBHX5TRQ'
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

export const WHATSAPP = '919833095599';
export const INSTAGRAM = 'https://instagram.com/';

export const STATUS = [
  ['new', 'New'],
  ['confirmed', 'Confirmed'],
  ['making', 'Being made'],
  ['shipped', 'Shipped'],
  ['delivered', 'Delivered'],
  ['cancelled', 'Cancelled']
];
export const statusLabel = (s) => (STATUS.find((x) => x[0] === s) || [s, s])[1];

export const THEMES = [
  { id: 'plain', label: 'Plain', bg: '#FFF8E9', ink: '#4A1230' },
  { id: 'pastel', label: 'Pastel', bg: '#FBD9E4', ink: '#4A1230' },
  { id: 'festive', label: 'Festive', bg: '#2A0E2E', ink: '#FFF3DC' },
  { id: 'event', label: 'Event', bg: '#A80F4E', ink: '#FFF3DC' },
  { id: 'peacock', label: 'Peacock', bg: '#0B5D53', ink: '#FFF8E9' },
  { id: 'sunshine', label: 'Sunshine', bg: '#F4A90F', ink: '#4A1230' },
  { id: 'deal', label: 'Deal', bg: '#C8102E', ink: '#FFF3DC' }
];

export const LAYOUTS = [
  { id: 'grid', label: 'Product grid' },
  { id: 'shelf', label: 'Arch shelf (scrolls sideways)' },
  { id: 'gallery', label: 'Photo wall' },
  { id: 'banner', label: 'Big banner (shows 3 photos from the next section)' },
  { id: 'offers', label: 'Offer coupons (items show only while their offer runs)' }
];

export const fmtPrice = (n) => '₹' + Number(n).toLocaleString('en-IN');

function toMillis(t) {
  if (!t) return null;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t === 'number') return t;
  return null;
}

// Works out what a customer pays right now. Offers switch off by themselves at offerEndsAt.
export function offerInfo(p, now = Date.now()) {
  const original = Number(p.price) > 0 ? Math.round(Number(p.price)) : null;
  const percent = Math.round(Number(p.offerPercent) || 0);
  const endsAt = toMillis(p.offerEndsAt);
  const active = !!(original && percent > 0 && percent < 100 && endsAt && endsAt > now);
  const price = active ? Math.round(original * (100 - percent) / 100) : original;
  return { active, price, original, percent: active ? percent : 0, endsAt, save: active ? original - price : 0, hasOffer: percent > 0 && !!endsAt };
}

export function timeLeft(ms) {
  if (ms <= 0) return 'Offer ended';
  const totalMin = Math.floor(ms / 60000);
  const d = Math.floor(totalMin / 1440), h = Math.floor((totalMin % 1440) / 60), m = totalMin % 60, s = Math.floor(ms / 1000) % 60;
  if (d) return 'Ends in ' + d + 'd ' + h + 'h';
  if (h) return 'Ends in ' + h + 'h ' + m + 'm';
  return 'Ends in ' + m + 'm ' + String(s).padStart(2, '0') + 's';
}

export function fmtWhen(ms) {
  return new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export const HERO_COLORS = [
  { id: 'cherry', label: 'Cherry red', c: '#C8102E', t: '#FFE9DC' },
  { id: 'forest', label: 'Forest green', c: '#15301C', t: '#FFD84D' },
  { id: 'candy', label: 'Candy pink', c: '#F58FB4', t: '#4A1230' },
  { id: 'sunshine', label: 'Sunshine', c: '#F4A90F', t: '#3C1A08' },
  { id: 'rose', label: 'Rose', c: '#A80F4E', t: '#FFD9E6' },
  { id: 'peacock', label: 'Peacock', c: '#0B5D53', t: '#FFE7A8' }
];

export function orderCode(id) {
  return 'FG-' + id.slice(0, 6).toUpperCase();
}

export function fmtDate(ts) {
  if (!ts || !ts.toDate) return 'Just now';
  return ts.toDate().toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export function validateProfile(raw) {
  const clean = {
    name: String(raw.name || '').trim().replace(/\s+/g, ' '),
    phone: String(raw.phone || '').replace(/[\s()-]/g, ''),
    address: String(raw.address || '').trim()
  };
  const errors = {};
  if (!clean.name) errors.name = 'Enter your name.';
  else if (clean.name.length > 80) errors.name = 'Keep your name under 80 characters.';
  if (!/^\+?\d{10,15}$/.test(clean.phone)) errors.phone = 'Enter a mobile number with 10 to 15 digits.';
  if (clean.address.length < 10) errors.address = 'Enter your full address with city and pincode.';
  else if (clean.address.length > 500) errors.address = 'Keep the address under 500 characters.';
  return { clean, errors, ok: Object.keys(errors).length === 0 };
}

export async function googleSignIn() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    return (await signInWithPopup(auth, provider)).user;
  } catch (e) {
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return null;
    if (e.code === 'auth/popup-blocked') { await signInWithRedirect(auth, provider); return null; }
    throw e;
  }
}

export async function getProfile(uid) {
  const s = await getDoc(doc(db, 'users', uid));
  return s.exists() ? s.data() : null;
}

const mediaCache = new Map();
export function mediaUrl(image) {
  if (!image) return Promise.resolve('');
  if (!image.startsWith('media:')) return Promise.resolve(image);
  const id = image.slice(6);
  if (!mediaCache.has(id)) {
    // Photo records never change (a new upload gets a new id), so the device cache is always right.
    const ref = doc(db, 'media', id);
    mediaCache.set(id, getDocFromCache(ref)
      .then((s) => (s.exists() ? s : getDoc(ref)))
      .catch(() => getDoc(ref))
      .then((s) => (s.exists() ? s.data().data : ''))
      .catch(() => ''));
  }
  return mediaCache.get(id);
}

// Flags an image as loading until it arrives; the CSS shows a spinning yarn ball meanwhile.
export function markLoading(img) {
  if (img.dataset.loading) return;
  img.dataset.loading = '1';
  const done = () => { delete img.dataset.loading; };
  img.addEventListener('load', done, { once: true });
  img.addEventListener('error', done, { once: true });
}

export function setImage(img, image) {
  if (!image) return;
  markLoading(img);
  mediaUrl(image).then((url) => {
    if (url) img.src = url;
    else delete img.dataset.loading;
  });
}

/* Catalogue cache: admins bump meta/catalog.version on every change. Visitors read that one
   record; when it matches what this device already has, sections and products come from the
   device cache with no further reads. */
const VERSION_KEY = 'fingo-catalog-version';

export async function loadCatalog() {
  const qs = [query(collection(db, 'sections'), orderBy('order')), query(collection(db, 'products'), orderBy('order'))];
  let version = null;
  try {
    const m = await getDoc(doc(db, 'meta', 'catalog'));
    const v = m.exists() ? m.data().version : null;
    version = v && v.toMillis ? String(v.toMillis()) : null;
  } catch (e) { console.error(e); }
  let known = null;
  try { known = localStorage.getItem(VERSION_KEY); } catch (e) {}
  if (version && version === known) {
    try {
      const [s, p] = await Promise.all(qs.map((q) => getDocsFromCache(q)));
      if (!s.empty && !p.empty) return { sections: s, products: p, fromCache: true };
    } catch (e) { /* cache missing: fall through to the server */ }
  }
  const [s, p] = await Promise.all(qs.map((q) => getDocs(q)));
  try { if (version) localStorage.setItem(VERSION_KEY, version); } catch (e) {}
  return { sections: s, products: p, fromCache: false };
}

export function bumpCatalog() {
  return setDoc(doc(db, 'meta', 'catalog'), { version: serverTimestamp() }).catch((e) => console.error(e));
}

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
}
