import { db, auth, googleSignIn, getProfile, validateProfile } from './firebase-shared.js?v=17';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  doc, setDoc, updateDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const $ = (id) => document.getElementById(id);
const next = new URLSearchParams(location.search).get('next');
const form = $('p-form');
let user = null;
let profile = null;

if (next === 'checkout') {
  $('p-why').textContent = 'Add your details to finish your order. You only do this once.';
  $('p-save').textContent = 'Save and continue to order';
}

$('p-signin').addEventListener('click', async () => {
  $('p-gate-msg').textContent = '';
  try { await googleSignIn(); } catch (e) {
    console.error(e);
    $('p-gate-msg').textContent = "Couldn't sign in with Google. Try again.";
  }
});
$('p-out').addEventListener('click', async () => { await signOut(auth); location.href = 'index.html'; });

onAuthStateChanged(auth, async (u) => {
  user = u;
  $('p-email').textContent = u ? u.email : '';
  $('p-gate').hidden = !!u;
  $('p-app').hidden = !u;
  if (!u) return;
  try { profile = await getProfile(u.uid); } catch (e) { console.error(e); profile = null; }
  const name = (profile && profile.name) || u.displayName || '';
  $('p-hello').textContent = name ? 'Hi ' + name.split(' ')[0] : 'Your account';
  form.elements.name.value = name;
  form.elements.phone.value = (profile && profile.phone) || '';
  form.elements.address.value = (profile && profile.address) || '';
  $('p-admin').hidden = !(profile && profile.role === 'admin');
});

form.addEventListener('input', (e) => { const t = $('err-' + e.target.name); if (t) t.textContent = ''; $('p-saved').textContent = ''; });

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const v = validateProfile({ name: form.elements.name.value, phone: form.elements.phone.value, address: form.elements.address.value });
  ['name', 'phone', 'address'].forEach((k) => { $('err-' + k).textContent = v.errors[k] || ''; });
  if (!v.ok) { form.elements[Object.keys(v.errors)[0]].focus(); return; }
  const btn = $('p-save');
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Saving…';
  $('p-msg').textContent = '';
  try {
    const ref = doc(db, 'users', user.uid);
    if (profile) {
      await updateDoc(ref, { name: v.clean.name, phone: v.clean.phone, address: v.clean.address, updatedAt: serverTimestamp() });
    } else {
      await setDoc(ref, { ...v.clean, email: user.email || '', role: 'user', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    }
    profile = Object.assign({ role: 'user' }, profile, v.clean);
    $('p-hello').textContent = 'Hi ' + v.clean.name.split(' ')[0];
    if (next === 'checkout') { location.href = 'index.html#checkout'; return; }
    $('p-saved').textContent = 'Details saved';
  } catch (err) {
    console.error(err);
    $('p-msg').textContent = "Couldn't save your details. Check your connection and try again.";
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
});
