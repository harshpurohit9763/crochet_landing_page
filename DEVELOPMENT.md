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

## Security checks (Nov 2026)

What the rules in `firestore.rules` enforce:

| Area | Rule |
|---|---|
| New orders | Customer details must equal the customer's saved profile and sign-in email. The order time is set by the server. One order a minute per account (`lastOrderAt` / `lastOrderId` on the user doc, written in the same batch as the order). |
| Order prices | Rules can't loop over the items list, so prices are checked on the admin page instead. Every order line is compared with the catalogue; a mismatch shows a red warning on the order. |
| Reviews | Only for a product listed in that delivered order (`productIds`), and only under the customer's first name. |
| Profiles | Phone must be 10–15 digits with an optional `+`. Email must be the sign-in email. Role is always `user`. |

Rules tests run against the local emulator. They are not committed; ask Claude to re-run them after changing the rules.

`tools/backfill-security.js` adds `productIds` to old orders and tidies old phone numbers. It is a dry run unless you pass `--apply`.

### Releasing a rules change together with site code

The new site code and the new rules depend on each other: old rules reject orders from the new site, and new rules reject orders from the old site. Release them back to back:

1. `FIREBASE_ENV=prod node tools/backfill-security.js harshpurohit117@gmail.com` (dry run; `--apply` only if it lists anything)
2. `firebase deploy --only firestore:rules --project prod`
3. `git push origin main` (Vercel deploys in about a minute)

## Bot protection (App Check)

The code is ready but off: `APP_CHECK_KEYS` in `js/firebase-config.js` is empty. To turn it on for a project:

1. Firebase console → that project → App Check → Apps → your web app → reCAPTCHA v3. It links to the reCAPTCHA admin page. Create a v3 key for the site's domains (`looplove.matterics.com` for prod; `localhost` for dev).
2. Paste the **site key** (public, safe to commit) into `APP_CHECK_KEYS` and bump `firebase-config.js?v=` in `firebase-shared.js`.
3. On dev, open localhost, copy the debug token the console prints, and add it under App Check → Apps → Manage debug tokens.
4. Watch App Check → APIs → Cloud Firestore for a few days. When almost all requests show as verified, press **Enforce**. Enforcing too early blocks real customers.
