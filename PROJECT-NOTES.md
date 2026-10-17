# Influencer platform: project notes

Last updated: 2026-10-18. Repo: github.com/shahzad-07/influencer-platform (public, so never commit a `.env` file or a real password). Shahzad and a friend both work on `main`.

## Stack

- Client: React + Vite + TypeScript (`client/`)
- Server: Node v24 + Express + Mongoose + zod + JWT (`server/`)
- Database: MongoDB Atlas free tier. Real-time chat: Socket.io.

## How we work (read this first)

- Beginner-friendly, one step at a time. The owner says "next" before moving on.
- Windows + Git Bash. Give exact commands, keep pasted commands short. For tests, use script files in `server/scripts`, not long curl commands.
- Give complete replacement files, one file at a time. After each, check: the first line of the file, then the type check, then the tests.
  - Server type check: `npx tsc --noEmit` in `server/`
  - Client type check: `npx tsc --noEmit -p tsconfig.app.json` in `client/`
- Never paste or print secrets or keys.
- After each major piece passes its checks, do a git step: verify, `cd` to the project root, `git status` (no `.env` listed), `git add .`, commit, `git pull`, `git push`. Then wait for "pushed".
- Two people on `main`: `git pull` before starting work and before pushing. Commit small and often. Say which files you are touching so you don't edit the same file. If a push is rejected: pull, re-run the type checks, push again. If a pull reports a conflict, stop and ask.

## Rules the code follows (keep them)

- Authorization is enforced on the server (`authenticate` + `requireRole`). The UI only reflects it. Pricing is visible to brands only.
- Money is whole paise (integers). Payment amounts come from the deal, never from the request.
- The deal flow is one table in `server/src/modules/deals/deal.transitions.ts`. The server returns `allowedActions` and the deal page shows only those buttons.
- No in-app payment gateway. The influencer saves payment details (encrypted AES-256-GCM, key `PAYMENT_ENCRYPTION_KEY` in `server/.env`) and shares them with a brand for a fixed 6 hours. The brand pays outside the app and enters a UTR. The influencer confirms or says "not received". Every view is logged.
- Collaboration types: PAID, BARTER, PAID_AND_BARTER. Barter-only skips payment steps (accept goes to IN_PROGRESS, verifyLink completes the deal).
- Mongo: bounded lists are embedded (portfolio, status history, payment records). Unbounded ones (chat messages) are separate collections.
- Scripts in `server/scripts` test everything.

## Done

- Auth with BRAND / INFLUENCER roles. Influencer profile, portfolio (links only, no uploads), brand-only pricing. Brand profile. Discovery both ways. Chat (REST + Socket.io) started by either side.
- Deals with a state machine. Encrypted payment details, 6-hour share with audit log, payment records.
- Collaboration types, backend and React: the Create Offer form (type picker, barter box, amount and advance hidden for barter-only), the deal page, and the deals list (type tag, "Barter" instead of ₹0).
- Payment terms: `client/src/components/PaymentTerms.tsx`, shown on the deal page and inside the offer form. Helpers `hasMoney` / `isPaidType` / `collabLabel` live in `client/src/lib/format.ts`.
- Languages: fixed list of 13, max 6 per influencer. The server list is `LANGUAGES` in `server/src/modules/profiles/profile.model.ts` and the client copy is `client/src/lib/languages.ts`. Change both together. Influencer picks them on their profile, brands filter with `?language=` on search, and they show on cards and the detail page.
- Rate limiting (server side), hand-written in `server/src/lib/rate-limit.ts`, switched on in `server/src/index.ts`:
  - 5 failed logins per account per connection per 15 minutes
  - 50 failed logins per connection per 15 minutes
  - 10 sign-ups per connection per hour
  - 300 requests per minute per connection for everything else
  - Only failed logins count, so normal logins and tests are not affected.
  - Counts live in server memory. Restarting the server clears them (handy if you lock yourself out while testing). This only works for one server instance, and on a free host it also resets whenever the server spins down.
  - Optional env vars: `TRUST_PROXY=1` (set it when the server is behind a hosting proxy) and `RATE_LIMIT_OFF=1` (local testing only, never in production).
- Terms page (draft): `client/src/pages/Terms.tsx`, a public `/terms` route in `client/src/App.tsx`, and a required "I agree to the Terms" checkbox on `client/src/pages/Signup.tsx`. The business name, contact email and city are placeholders in one block at the top of `Terms.tsx` and still need filling in. A lawyer must review the text before launch.
- Test scripts no longer contain any default login. The influencer test account comes only from environment variables, through `server/scripts/test-env.mjs` (see "Test scripts" below).

## In progress: step 5, free-tier deploy

Decision: Render for both the server (Web Service) and the client (Static Site). Pieces, in order:

1. Pre-deploy cleanup: test scripts read the influencer login from environment variables only. DONE.
2. Server ready for production: `build` and `start` scripts in `server/package.json`, and check how CORS, Socket.io and `TRUST_PROXY=1` use `CLIENT_URL`. - Done
3. Client ready: DONE for the code. There is now one setting, `VITE_API_URL` (the server address ending in `/api`, no trailing slash). The chat address is worked out from it, and `VITE_SOCKET_URL` no longer exists. It is baked in when the client is built, so set it on the host before building. Still to do in piece 5: the rewrite rule on Render that sends every page URL to `index.html` (otherwise refreshing `/deals` gives a 404).
4. A separate production database: DONE. A new Atlas project `influencer-platform-prod` with its own free cluster, database user `influencer_app`, and Network Access `0.0.0.0/0` (Render's free tier has no fixed IP, so the protection is the long random password). The database name is `influencerprod`. The connection string is kept only in the owner's password manager. It goes into Render as `MONGODB_URI` and never into `server/.env` on a PC. Atlas may deactivate idle free clusters, so don't treat it as permanent storage.
5. Deploy on Render.
   - 5a. Server: DONE and live at `https://influencer-platform-api.onrender.com` (health page: `/api/health`). Settings used: Web Service, Free, region Singapore, branch `main`, Root Directory `server`, Build Command `npm ci && npm run build`, Start Command `npm start`, Health Check Path `/api/health`. Environment variables set: `NODE_VERSION=24`, `MONGODB_URI` (the production string, which must end in `/influencerprod?...`), `JWT_SECRET` and `PAYMENT_ENCRYPTION_KEY` (both new, made for production and backed up in the password manager). `CLIENT_URL` was added in 5c. Not set yet: `TRUST_PROXY` (see "Things to remember").
   - 5b. Client as a Render Static Site: DONE, live at `https://influencer-platform-web-7qdx.onrender.com`. Settings used: root directory `client`, build command `npm ci && npm run build`, publish directory `dist`, environment variables `VITE_API_URL` = `https://influencer-platform-api.onrender.com/api` and `NODE_VERSION=24`, and a Rewrite rule (source `/*`, destination `/index.html`, action Rewrite) so refreshing `/deals` does not give a 404. `VITE_API_URL` is baked in at build time, so if it ever changes the site must be rebuilt.
   - 5c. `CLIENT_URL` on the server = `https://influencer-platform-web-7qdx.onrender.com`: DONE. The server redeployed and its start-up warning about `CLIENT_URL` is gone.
   - 5d. Measure `TRUST_PROXY` (see "Things to remember"). TO DO.
6. Smoke test on the live site: sign up (never a `@test.com` address or a guessable password; use a strong password that is used nowhere else), make an offer, run a barter deal, check chat. TO DO. The accounts and deals made here are real rows in the production database, and there is no delete-account feature yet, so remove them in Atlas (database `influencerprod`) before real users arrive.

Things to remember:

- Environment variables: `MONGODB_URI`, `JWT_SECRET`, `PAYMENT_ENCRYPTION_KEY`, `CLIENT_URL`, `NODE_VERSION`, and `TRUST_PROXY` once measured, on the server (`PORT` is set by Render, so don't add it), and `VITE_API_URL` (the only client setting) on the client. Use new production values for the secrets, not the dev ones. Never set `RATE_LIMIT_OFF` in production.
- `TRUST_PROXY`: do NOT set it to 1 without measuring. Other projects measured 3 proxy hops in front of apps on Render (client, Cloudflare, Render's load balancer) and one assumed 1, so the real number is uncertain. A wrong number means either all visitors share one rate limit, or the limit can be dodged by faking an address. Plan: after the client is live, add a temporary log line that prints only how many addresses are in `X-Forwarded-For` (the count, never the addresses), call `/api/health` from outside, read the count in Render's logs, set `TRUST_PROXY` to that number, then remove the log line. Until then it stays unset, so on the live site all visitors share one limit bucket, which is fine for a smoke test and bad for real users.
- Node version on Render: `NODE_VERSION=24` (it wins over everything else). `engines` in `server/package.json` is `>=22` with no upper limit, which Render resolves to the newest Node release, so don't remove the variable (or add an upper bound such as `>=22 <25`).
- Render dashboard: a service's own variables are on its **Environment** page in the left sidebar (scroll the sidebar down). The `← Environment` link at the top left is only the breadcrumb back to the project overview. Saving a variable normally redeploys by itself; if not, use **Manual Deploy** then **Deploy latest commit**.
- CORS and Socket.io must allow only the real client URL.
- A free Render web service spins down after 15 minutes without traffic and takes about a minute to wake. Fine for testing, not for real users (a paid always-on server removes this).
- Atlas Network Access: a free Render service has no fixed outgoing IP, so the production cluster will probably need to allow access from anywhere (`0.0.0.0/0`), protected by a strong database password. A trade-off to accept knowingly.
- Never put the production connection string in `server/.env` on a PC. It lives only on the hosting service. Never run test scripts against production.

## Next

Small to-dos (any time):

- Make the `PAYMENT_ENCRYPTION_KEY` startup error in `server/src/index.ts` say how many characters it found (never the value). It would have shown straight away that a pasted key had extra characters.
- A real change of `PAYMENT_ENCRYPTION_KEY` after data exists would need a one-time migration script (decrypt with the old key, encrypt with the new one). It does not exist yet. The `v1:` prefix on stored values leaves room for it.

Later: brand subscription gate, dashboards, reviews and reputation, notifications, phone OTP, open campaigns, counter-offers, multiple deliverables, rate cards, chat upgrades, availability toggle, deal agreement, admin/disputes and the offer-expiry job.

Not wanted: reel uploads, SEO/growth pages, AI helper.

## Security and legal to-dos

- The old default login that was written in the test scripts is in the git history of a public repo, so it is permanently public. Never reuse that password anywhere. The scripts now have no defaults.
- The brand and outsider test accounts (`brand@test.com`, `other@test.com`, `brand2@test.com`, password `password123`) are throwaway dev accounts. They must never exist on the production database.
- Fill in the business name, contact email and city at the top of `Terms.tsx`.
- The Terms checkbox is only checked in the browser. Later, record on the server when each user accepted and which version.
- A privacy policy is also needed (personal data, India's DPDP Act). Get both documents reviewed by a lawyer.
- Chat messages are not rate limited, and Socket.io is not covered by the limiter.

## Known gotchas

- Atlas blocks the IP when it changes (Network Access).
- In Git Bash, `node` inside `$(...)` fails (not a tty), and long pasted commands get mangled.
- Pasting several files at once once put code in the wrong files, so do one file at a time.
- Before replacing a file, make sure you have the latest version. Local files can be ahead of what a chat was shown.
- Production secrets: never type them into chat, a file in the repo, or a screenshot. Make them with the helper scripts below, which put them on the clipboard without showing them, paste them straight into Render and the password manager, then copy other text to clear the clipboard (and clear Windows clipboard history with Win+V).
- `PAYMENT_ENCRYPTION_KEY` is the one secret that must be backed up before anything else. See "What happens if a secret is lost" below.
- The first Render deploy of the server failed because the pasted `PAYMENT_ENCRYPTION_KEY` was not 64 clean hex characters (a check showed 67 characters at one point). The helper scripts themselves produce a clean key, and the cause of the extra characters was not found. Since nothing was encrypted yet, the key was simply replaced. Always run `check-clipboard.mjs` before pasting a key, and again on the password manager's copy of it.

## What happens if a secret is lost

- `PAYMENT_ENCRYPTION_KEY`: it only protects influencers' saved payment details (the `PaymentDetails` collection; shares decrypt the current details when a brand views them, they keep no copy). If the key is lost or changed, those details can't be read: the influencer's page says "Could not read the saved details" and a brand opening shared details gets "Could not read the payment details". Deals, payment records (UTRs, amounts), chat and profiles are not encrypted with it, so nothing else is lost and no money is lost. Each influencer then has to enter their payment details again. The key can still be read from the Environment page of the Render service while the service exists, so the password manager copy protects against losing the Render account or deleting the service.
- `JWT_SECRET`: can be replaced any time. Everyone just has to log in again.
- `MONGODB_URI`: if lost, reset the database user's password in Atlas and update Render. No data is affected.

## Helper scripts (in `server/`, Windows only, they use the `clip` command)

- `node scripts/make-secret.mjs payment` makes a new 64-character hex `PAYMENT_ENCRYPTION_KEY` and copies it to the clipboard. `node scripts/make-secret.mjs jwt` does the same for a `JWT_SECRET`. Nothing is printed except the length, and nothing is saved to a file. Each run replaces the clipboard, so paste before you run it again.
- `node scripts/check-clipboard.mjs` checks that the clipboard holds a clean 64-character hex key. It prints only the length, how many characters are not hex, and the codes of up to 10 of them (so only use it on a key you have just made or are about to discard, not on other secrets). Chain them to rule out anything changing the clipboard in between: `node scripts/make-secret.mjs payment && node scripts/check-clipboard.mjs`.
- `scripts/make-key.mjs` (older) writes a dev key into `server/.env`. Don't use it for production.

## Test scripts

Run in `server/`, with the server running (`npm run dev`).

The influencer test account has no default. Sign it up once in the dev app (made-up email, strong password you use nowhere else), then in each terminal window set it. The second command asks for the password silently:

```
export INFLUENCER_EMAIL=influencer@test.com
read -s -p "Influencer test password: " INFLUENCER_PASSWORD; export INFLUENCER_PASSWORD
```

If the variables are missing, the scripts stop with a clear message. Two scripts (`payment-details-test.mjs`, `payment-share-test.mjs`) also connect straight to the database from `server/.env`, so they are for the dev database only.

- `npx tsx scripts/transitions-test.ts`
- `npx tsx scripts/barter-transitions-test.ts`
- `npx tsx scripts/crypto-test.ts`
- `npx tsx scripts/rate-limit-test.ts` (no server needed)
- `node scripts/deals-test.mjs`
- `node scripts/payment-share-test.mjs`
- `node scripts/payment-records-test.mjs`
- `node scripts/payment-details-test.mjs`
- `node scripts/collab-test.mjs`
- `node scripts/portfolio-test.mjs`
- `node scripts/language-test.mjs`
- `node scripts/rate-limit-api-test.mjs`
- `node scripts/socket-test.mjs`

## Starting a new chat with Claude

Tell it to read this file and the files it needs from the GitHub repo (`main`), and to start with "In progress". Check that it uses the latest files before replacing anything.

## Shared log (Shahzad and friend)

How to use this log:

- Before you start: `git pull`. Read the newest entry in your name and the other person's.
- When you finish a piece of work: add a new entry at the end of YOUR OWN list below, then commit and push it together with your code.
- Each entry: date, files touched, what changed, what is left, and anything the other person must know. Keep it short.
- Don't edit the other person's list. That keeps `git pull` free of conflicts.
- "In progress" and "Done" above stay the single source of truth for what is pending. Update them when a step is finished.

### Shahzad's entries

- 2026-10-17: Rate limiting finished and tested. Languages finished. Payment terms done. Started using this log.
- 2026-10-17: Terms page (`Terms.tsx`), public `/terms` route in `App.tsx`, and the required "I agree to the Terms" checkbox in `Signup.tsx`. Step 4 is finished. Still to do: fill in the business name, email and city at the top of `Terms.tsx`, and get the text reviewed by a lawyer.
- 2026-10-17: Step 5 started (deploy on Render, both server and client). Piece 1 done: new `server/scripts/test-env.mjs`, and 8 test scripts (`deals`, `collab`, `language`, `payment-details`, `payment-records`, `payment-share`, `portfolio`, `socket`) now read the influencer login from `INFLUENCER_EMAIL` / `INFLUENCER_PASSWORD` only, with no defaults. After you pull, set the two variables (see "Test scripts"), and use your own made-up test account. Next: piece 2, the server build/start scripts and CORS check.
- 2026-10-17: Step 5 piece 2 done. `server/src/index.ts` now checks its settings at startup (stops with a clear message if `MONGODB_URI`, `JWT_SECRET` or `PAYMENT_ENCRYPTION_KEY` is missing or malformed) and allows browser calls only from `CLIENT_URL` (no trailing slash; defaults to `http://localhost:5173`, so if your Vite runs on another port, set `CLIENT_URL` in `server/.env`). `server/package.json` has new `build` (esbuild bundle into `dist/`) and `start` scripts, and `esbuild` as a dev dependency. After you pull, run `npm install` in `server/`. Daily work is still `npm run dev`. Next: piece 3, the client.
- 2026-10-17: Step 5 piece 3 done. `client/src/lib/api.ts` exports `API_URL` (trailing slash removed, console error in a live build if `VITE_API_URL` is missing). `client/src/lib/socket.ts` now derives the chat address from `API_URL`, so `VITE_SOCKET_URL` is gone. Nothing changes for local work. Next: piece 4, the separate production database on Atlas.
- 2026-10-17: Step 5 piece 4 done (production database set up in Atlas, no code changes). Nothing to pull or run. The connection string is not in the repo and must stay out of it. Next: piece 5, the deploy on Render, starting with new production values for `JWT_SECRET` and `PAYMENT_ENCRYPTION_KEY`.

### Shazu's entries (the friend)

- 2026-10-18 (Shazu): Step 5, piece 5a done: the server is live on Render at `https://influencer-platform-api.onrender.com` (settings and variables are listed under "In progress", step 5a). New files: `server/scripts/make-secret.mjs` and `server/scripts/check-clipboard.mjs` (see "Helper scripts"). Added the sections "What happens if a secret is lost" and "Helper scripts", and corrected the `TRUST_PROXY` advice (don't use 1 without measuring). Checked: the build and start commands ran on Render (Node 24.22.0) and Render shows the service as Live. The first deploy failed on a malformed `PAYMENT_ENCRYPTION_KEY`. It was replaced before any data existed. Nothing to pull or run on your side; no code in `src/` changed. Next: 5b, the client as a Render Static Site, then 5c (`CLIENT_URL`) and 5d (measure `TRUST_PROXY`).
- 2026-10-18 (Shazu): Step 5, pieces 5b and 5c done. The client is live on Render as a Static Site at `https://influencer-platform-web-7qdx.onrender.com`, and `CLIENT_URL` on the server now points at it (details under "In progress", 5b and 5c). No code changed; only these notes. Checked: the local `npm run build` in `client/` passed, the Render build passed, the rewrite rule was added, and the server log shows `MongoDB connected` and no `CLIENT_URL` warning. Not checked yet: signing up and logging in on the live site (that is the start of step 6). Important before real users: `TRUST_PROXY` is still unset, so all visitors currently share one rate-limit bucket. That means 50 failed logins from anyone lock logins for everybody for 15 minutes, and 5 failed logins on one account lock it for its owner too. Do step 5d before real users arrive. Next: step 6, the smoke test, then 5d.
