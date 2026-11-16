# LoopLove: development and production

The shop runs on two separate Firebase projects. They share nothing: their own database, sign-in users, rules and config.

| | Development | Production |
|---|---|---|
| Firebase project ID | `looplove-dev` | `crochetlandingpage` (display name: **looplove**) |
| Used by | localhost, LAN IPs, Vercel preview URLs | `looplove.matterics.com` only |
| `.firebaserc` alias | `dev` (also `default`) | `prod` |
| Data | Copy of the prod catalogue, test users and orders | Real customers and orders |

The Firebase project ID `crochetlandingpage` can't be renamed (Google doesn't allow it). Only its display name changed, to "looplove".

## How the website picks a project

There is no build step, so the site picks its config at runtime in `js/firebase-config.js`:

- If the hostname is in `PROD_HOSTS` (`looplove.matterics.com`), it uses production.
- Anywhere else (`localhost:5173`, `192.168.x.x`, `*.vercel.app` previews), it uses development.

When a page is on development, a green **DEV data** pill shows in the bottom-left corner.

To add another live domain, add it to `PROD_HOSTS`.

Firebase web configs (`apiKey`, `appId`, …) identify a project; they are not secrets. Access is controlled by `firestore.rules` and each project's authorised domains. Real secrets (the CLI login, `.env`) are never committed.

## Running locally

```bash
python -m http.server 5173
```

Open http://localhost:5173. It talks only to `looplove-dev`.

Google sign-in on dev works on `localhost` and `127.0.0.1`. Those are in the authorised domains of looplove-dev. To test from a phone on your LAN IP or on a Vercel preview, first add that host in Firebase console → looplove-dev → Authentication → Settings → Authorized domains.

Users who sign in on dev are separate from production users. Nothing done on localhost (sign-ups, baskets, orders, catalogue edits in the admin page) reaches the live shop.

### Make yourself admin on dev

Do this once. First sign in with Google on localhost, then run:

```bash
node tools/set-role.js harshpurohit117@gmail.com <your-google-email> admin
```

## Admin scripts (`tools/`)

These scripts use the Firebase CLI login. They target **dev** unless told otherwise:

- `.env` (copied from `.env.example`, git-ignored): `FIREBASE_ENV=dev` or `prod`
- or per command: `FIREBASE_ENV=prod node tools/...`

Every script prints `[env] DEV -> looplove-dev` or `[env] PROD -> crochetlandingpage` before it does anything.

Refresh dev with the live catalogue (prod is only read; users, carts, orders and reviews are never copied):

```bash
node tools/copy-catalog-to-dev.js harshpurohit117@gmail.com
```

## Deploying rules and auth

```bash
firebase deploy --only firestore:rules,auth --project dev
```

```bash
firebase deploy --only firestore:rules,auth --project prod
```

A plain `firebase deploy` goes to dev (the default alias). The website itself deploys through Vercel when `main` is pushed to GitHub.

## Storage

Both projects are on the free Spark plan, which has no Cloud Storage bucket. Photos live in the `media` collection as data URLs in each project's own database, so dev and prod photos are separate too.
