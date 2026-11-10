// Sets a Fingo user's role ('admin' or 'user') by email, using the Firebase CLI login.
// Usage: node tools/set-role.js <cli-login-email> <user-email> <admin|user>
const path = require('path');
const lib = path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'firebase-tools', 'lib');
const auth = require(path.join(lib, 'auth.js'));

const PROJECT = 'crochetlandingpage';

(async () => {
  const [cliEmail, userEmail, role] = process.argv.slice(2);
  if (!['admin', 'user'].includes(role)) throw new Error('Role must be admin or user');
  const acct = auth.findAccountByEmail(cliEmail);
  if (!acct) throw new Error('No Firebase CLI login for ' + cliEmail);
  const tok = (await auth.getAccessToken(acct.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform'])).access_token;
  const headers = { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json', 'x-goog-user-project': PROJECT };

  const look = await (await fetch('https://identitytoolkit.googleapis.com/v1/projects/' + PROJECT + '/accounts:lookup', {
    method: 'POST', headers, body: JSON.stringify({ email: [userEmail] })
  })).json();
  if (look.error) throw new Error(JSON.stringify(look.error));
  const u = (look.users || [])[0];
  if (!u) throw new Error(userEmail + ' has never signed in to the site');
  console.log('found', u.email, 'uid', u.localId);

  const docUrl = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents/users/' + u.localId;
  const before = await (await fetch(docUrl, { headers })).json();
  const exists = !before.error;
  console.log(exists ? 'profile exists, role was ' + ((before.fields && before.fields.role && before.fields.role.stringValue) || 'none') : 'no profile yet, creating one');

  const fields = { role: { stringValue: role }, updatedAt: { timestampValue: new Date().toISOString() } };
  let mask = 'updateMask.fieldPaths=role&updateMask.fieldPaths=updatedAt';
  if (!exists) {
    fields.email = { stringValue: u.email };
    fields.createdAt = { timestampValue: new Date().toISOString() };
    mask += '&updateMask.fieldPaths=email&updateMask.fieldPaths=createdAt';
  }
  const res = await (await fetch(docUrl + '?' + mask, { method: 'PATCH', headers, body: JSON.stringify({ fields }) })).json();
  if (res.error) throw new Error(JSON.stringify(res.error));
  console.log('role is now', res.fields.role.stringValue);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
