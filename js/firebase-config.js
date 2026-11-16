// Public Firebase web configs. These identify the project, they are not secrets:
// access is enforced by firestore.rules and the authorised domains list in each project.
const CONFIGS = {
  prod: {
    apiKey: 'AIzaSyByGq8GGG4vOR9kloKWa7Uoz61DHjCZZQ8',
    authDomain: 'crochetlandingpage.firebaseapp.com',
    projectId: 'crochetlandingpage',
    storageBucket: 'crochetlandingpage.firebasestorage.app',
    messagingSenderId: '25053424852',
    appId: '1:25053424852:web:fbc1d740506bd6226e9f41',
    measurementId: 'G-7GWBHX5TRQ'
  },
  dev: {
    apiKey: 'AIzaSyDaFHvvb5-4CPQavbqz4ArsJe9AmfblYVY',
    authDomain: 'looplove-dev.firebaseapp.com',
    projectId: 'looplove-dev',
    storageBucket: 'looplove-dev.firebasestorage.app',
    messagingSenderId: '45025460317',
    appId: '1:45025460317:web:a4539ee627a48d2d6a0db4'
  }
};

// Only the live domain talks to production. Localhost, LAN addresses and Vercel previews use dev.
const PROD_HOSTS = ['looplove.matterics.com', 'www.looplove.matterics.com'];

export const ENV = PROD_HOSTS.includes(location.hostname) ? 'prod' : 'dev';
export const firebaseConfig = CONFIGS[ENV];

// Firebase App Check (bot protection) with reCAPTCHA v3. Leave a key empty to keep App Check off
// for that project. See DEVELOPMENT.md for how to create the key and when to turn on enforcement.
const APP_CHECK_KEYS = {
  prod: '',
  dev: ''
};
export const appCheckKey = APP_CHECK_KEYS[ENV];
