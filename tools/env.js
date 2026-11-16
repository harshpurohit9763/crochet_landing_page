// Picks the Firebase project for admin scripts. Dev unless FIREBASE_ENV=prod is set (shell or .env).
const fs = require('fs');
const path = require('path');

const PROJECTS = { dev: 'looplove-dev', prod: 'crochetlandingpage' };

function readDotEnv() {
  const out = {};
  try {
    fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/).forEach((line) => {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    });
  } catch (e) { /* no .env: defaults apply */ }
  return out;
}

const file = readDotEnv();
const ENV = (process.env.FIREBASE_ENV || file.FIREBASE_ENV || 'dev').toLowerCase();
if (!PROJECTS[ENV]) throw new Error('FIREBASE_ENV must be dev or prod, got ' + ENV);
const PROJECT = PROJECTS[ENV];
console.error('[env] ' + ENV.toUpperCase() + ' -> ' + PROJECT);

module.exports = { ENV, PROJECT, PROJECTS };
