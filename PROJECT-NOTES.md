# Influencer platform: project notes

Last updated: 2026-10-22. Repo: github.com/shahzad-07/influencer-platform (public, so never commit a `.env` file or a real password). Shahzad and a friend both work on `main`.

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
- No in-app payment gateway. The creator saves payment details (encrypted AES-256-GCM, key `PAYMENT_ENCRYPTION_KEY` in `server/.env`). For a paid deal, the brand can view them only for that deal at the due stage (advance after acceptance; final after the post is verified live). The server authorizes access, decrypts after authorization, and logs every view; the creator can see the access log. The brand pays outside the app and records whether it was sent; a payment reference is optional. M3 was deployed on 2026-10-22 after the owner reported the browser check passed; the live API health and client homepage both returned HTTP 200.
- Collaboration types: PAID, BARTER, PAID_AND_BARTER. Barter-only skips payment steps (accept goes to IN_PROGRESS, verifyLink completes the deal).
- Mongo: bounded lists are embedded (portfolio, status history, payment records). Unbounded ones (chat messages) are separate collections.
- Scripts in `server/scripts` test everything.

## Done

- Auth with BRAND / INFLUENCER roles. Influencer profile, portfolio (links only, no uploads), brand-only pricing. Brand profile. Discovery both ways. Chat (REST + Socket.io) started by either side.
- Deals with a state machine. Encrypted payment details, payment records, and M3 stage-based payment-detail access (browser check passed and manually deployed 2026-10-22).
- M4 notifications: authenticated in-app list and unread count, live new-offer and deal-action notifications, deal links that mark items read, and confirmed payment quick actions. The owner deployed the offer-created server change and reported notification checks passing on mobile and laptop and the payment confirmation browser check passing on 2026-10-22. The 22-check notification integration script passed.
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
   - 5d. `TRUST_PROXY=3`: DONE. Measured as 3 proxy hops, set as `TRUST_PROXY` = `3` on the Render server, and the temporary measuring code was removed again.
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

## UI redesign (in progress, UI only, no functionality changes)

Brand: DealDoneHai, Bengaluru, dealdonehai@gmail.com. Tagline: "Brands meet creators. Deals get done." Free to start (no pricing claims beyond that yet). Look: violet `#5b3df5` and lime `#d4f55a`, fonts Bricolage Grotesque (headings) and Hanken Grotesk (body), light and dark theme (sun/moon toggle, saved in localStorage, defaults to the device setting). Phones: bottom tab bar after login; laptops: top menu. Only visible words change from "influencer" to "creator"; code names, the `INFLUENCER` role value, routes (`/influencer/...`) and file names stay.

Done so far:

- Milestone 1: `index.html`, `src/index.css` (the design system), `ThemeToggle`, `Logo`, `SiteHeader`, `MobileTabBar`, `SiteFooter`, `AppLayout`, `Landing` (public home at `/`), `App.tsx` (`/` shows Landing to visitors), `Login`, `Signup` (reads `?role=brand|creator`), `Terms` (business details filled in), both dashboards.
- Milestone 2 (restyled and reworded, logic unchanged): `BrowseInfluencers`, `InfluencerDetail`, `InfluencerProfile`, `InfluencerPricing`, `BrowseBrands`, `BrandDetail`, `BrandProfile`, `CreateOffer`, `PaymentTerms`, `Deals`, `DealDetail`, `PaymentSharePanel`, `PaymentDetails`, `Messages` (list and chat side by side on a laptop, one pane at a time on a phone). All logged-in pages are wrapped in `AppLayout` (header, mobile bottom tab bar). Shared CSS classes added to `index.css` for them: `.stack`, `.card`, `.field`, `.input`, `.cards`, `.person`, `.tags`, `.tag`, `.filters`, `.pager`, `.detail`, `.price-row`, `.choices`, `.terms`, `.deal`, `.timeline`, `.kv`, `.chip-check`, `.group`, `.alert`, `.success`. Reuse them instead of inline styles.

Still to do (next person picks up here):

1. Check the live site on a real phone (Chrome and Safari): landing page, sign up, a deal, chat, the bottom tab bar, dark theme. Fix anything that looks wrong.
2. Optional later: a phone home-screen icon (`apple-touch-icon`) and a share image for links; rename the `/influencer/...` URLs and file names to `creator`; the leftover word "influencer" now only appears in code names and code comments.
3. The earlier deploy to-dos still stand (see "In progress" and "Next"): the smoke test on the live site, a lawyer review of the Terms, a privacy policy.
   Rules for this work: UI only, no behaviour changes; keep every server-side rule; labels on every field; test at 360 px wide and in dark theme; `npx tsc --noEmit -p tsconfig.app.json` after each file.

## Deploying (manual, since 2026-10-20)

Auto-Deploy is Off on both Render services, so pushing to `main` does not change the live site. To release:

1. Test locally and push to `main` as usual.
2. In Render, open the server service, then **Manual Deploy** > **Deploy latest commit**. Wait for **Live** and check the Logs.
3. Do the same for the client service.

If a change touches both sides, deploy the server first. Deploying a specific commit or rolling back also turns auto-deploy off in Render, which is fine. Leave it off.

## Backlog and milestones (agreed 2026-10-20)

Done one at a time, in this order. Each milestone ends with the type checks, tests, a browser check, a git step and, if the server changed, a manual deploy (server first, then client).

1. M1, deal page and slow login (client, small). DONE: the code is on `main` (2026-10-21). Whether it has been manually deployed to the live client is not recorded here; check Render.
   - Deal page: a "Next step" card at the top (who must act, with their buttons; the other side sees "Waiting for X"), and the timeline newest first.
   - Slow login/signup: first find the cause (free server waking up vs password hashing). Likely fixes: wake the server when the landing page opens, show a "waking up, can take a minute" message, later a keep-alive ping or a paid always-on server.
2. M2, payment reference optional (server + client, small). The brand may leave it empty. DONE 2026-10-22. The server had accepted an empty reference since 2026-10-17 (`reference` in `actionSchema` in `deal.routes.ts`, empty means "not given", and a given one must be 6 to 30 letters, digits or dashes and cannot be reused on the same deal) and `payment-records-test.mjs` already tested it, so M2 only changed the client (`DealDetail.tsx`, `PaymentTerms.tsx`, `PaymentSharePanel.tsx`). Its client changes were included in the M3 manual client deployment on 2026-10-22.
3. M3, stage-based payment details (server + client, medium). DONE 2026-10-22. The owner reported the browser check passed and completed manual deployment. The API health endpoint and client homepage both returned HTTP 200.
   - After the creator accepts, the brand gets a "Show payment details" button at the payment stages (advance due, final due) of that deal only. No approval each time.
   - The server decrypts only for the brand of that deal, only at those stages. Every view is logged and the creator can see the log. The QR with the amount stays.
   - A creator must have saved payment details before accepting a paid offer, and the accept screen says the brand will see them when payment is due.
   - The Terms section 5 and payment rule above are updated. The share routes and `payment-share-test.mjs` are replaced. Server type/build and payment tests passed; client type checks and production build passed; the owner reported the browser check passed. Deployed server first, then client, on 2026-10-22.
4. M4, notifications (server + client, medium)
   - DONE 2026-10-22. The owner reported mobile and laptop notification behavior and that the payment confirmation browser check passed. The offer-created server change was manually deployed; the notification integration script passed all 22 checks.
   - A bell with an unread count and a list. Clicking an item opens the deal. Payment items have a quick "Yes, received" button with a confirmation.
   - A separate collection; the server creates notifications for new offers and successful deal transitions, with live delivery through Socket.io.
5. M5, WhatsApp-style chat (server + client, medium)
   - Scope confirmed by the owner on 2026-10-22: show only existing conversations.
   - A conversation list sorted by last message with a preview, bold unread rows, round unread count, and an unread total on the chat icon (tab bar on phone, header on laptop).
   - Marked as read when opened, live updates.
6. M6, draft file upload (server + client, large)
   - Drafts only. The portfolio stays links only.
   - The browser uploads straight to object storage with a short-lived signed URL, so the server never handles the video. Size and type limits. Each submission is a version. The brand watches it in the app. Files are deleted some time after the deal ends.
   - First compare storage providers and their free limits (not checked yet).
7. M7, calendar (server + client, medium)
   - Schedule items on a deal (shoot, visit, go-live). Either side proposes a date and time, the other accepts or suggests another. Accepted items show on both calendars (month and list). Stored inside the deal. Times in IST. Notifications on proposals and changes.
8. M8, brand campaigns / broadcast (server + client, large)
   - Needs two creator profile fields: niche and follower count (self-declared, labelled so).
   - A brand posts a campaign (brief, niche, minimum followers, languages, creators needed, collaboration type, deadline). Matching creators see it and apply. The brand shortlists and turns an applicant into an offer. Matching creators get a notification (M4).
9. M9, email notifications (server, medium). So people come back to the app. Needs an email provider (free tier to check).

Separate track before real users sign up: clean the test data in production, a privacy policy, check that expired offers are blocked, password reset, dispute handling, lawyer review. The M3 Terms copy is updated; lawyer review is still needed.

Small later fix: logging in as a second account in the same browser silently replaces the first tab's login. Show a "signed in as another account" message.

To confirm at the start of each milestone: M5 (the list shows conversations only), M6 (provider, whether links stay as a fallback), M7 (which kinds of schedule items), M8 (creators apply, or the brand invites). M3 is confirmed: payment details are optional at signup, but required before a creator accepts a paid offer.

## Next

Small to-dos (any time):

- Make the `PAYMENT_ENCRYPTION_KEY` startup error in `server/src/index.ts` say how many characters it found (never the value). It would have shown straight away that a pasted key had extra characters.
- A real change of `PAYMENT_ENCRYPTION_KEY` after data exists would need a one-time migration script (decrypt with the old key, encrypt with the new one). It does not exist yet. The `v1:` prefix on stored values leaves room for it.

Later: brand subscription gate, dashboards, reviews and reputation, notifications, phone OTP, open campaigns, counter-offers, multiple deliverables, rate cards, chat upgrades, availability toggle, deal agreement, admin/disputes and the offer-expiry job.

Not wanted: portfolio or reel hosting (the portfolio stays links only), SEO/growth pages, AI helper. Wanted, in milestone M6: video file upload for drafts only, so the brand can approve before posting.

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

## Owner decisions and plans (2026-10-21)

- 2026-10-22: M3 confirmed: creators may leave payment details blank at signup, but must save them before accepting a paid offer. The server must enforce this.
- 2026-10-22: M6's 1 MB limit applies to draft video uploads after a creator visits a restaurant or place. The owner chose 1 MB for now because of the free-tier limitation; do not apply it to another feature.
- Slow first login (the free server waking up): a "server may be waking up" note is enough for now (`SlowNotice`, done in M1 part 1). Later: wake the server when the landing page opens, or a paid always-on server.
- On 2026-10-22, the owner confirmed that the 1 MB "for now" limit applies to M6 draft video uploads after a creator visits a restaurant or place. It is due to the free-tier limitation; do not apply it to another feature.
- Notifications, in this order: (1) in-app: a bell with an unread count ("3 unread") and a list, M4; (2) phone push with sound, later, when the Play Store app exists; (3) email, later, M9. Email is not needed yet.
- Password reset ("forgot password") is wanted on the login page. Findings: Render's free web services block outgoing SMTP ports (25, 465, 587), so plain Gmail SMTP will not work. Use an email service with an HTTPS API (free tier, a verified sender; check what works without owning a domain). Plan: a `PasswordReset` collection (hashed one-time token, expires in about 30 minutes, single use), `POST /api/auth/forgot-password` (always answers the same message, whether or not the email exists, and is rate limited), `POST /api/auth/reset-password` (token and new password, min 8 characters), a "Forgot password?" link on `Login.tsx`, and two new pages. Since the JWT is stateless, old logins stay valid until they expire (7 days). Decide whether to add a token version to end them. This needs the email provider from M9, so do the provider choice once and use it for both.
- "Forgot my login ID": the ID is the email address. It cannot be recovered safely by email alone. It needs a phone number with an OTP, which is a later item.
- Login limits (already live): 5 wrong passwords for one email from one connection lock that email for 15 minutes; 50 wrong passwords from one connection lock that connection. With `TRUST_PROXY=3` both count real visitor addresses.

## Starting a new chat with Claude

Claude can only read the repo, it cannot push: it attaches the repo (`shahzad-07/influencer-platform`), gives complete files, and the owner saves them, tests, commits and pushes. Tell it to pull the repo (`main`), read this whole file, and start from "Backlog and milestones" and the newest entries in the Shared log, both people's. Say which milestone you are on. Check that it uses the latest files before replacing anything, and make it confirm what it understood before it writes code.

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
- 2026-10-20: `TRUST_PROXY=3` is set on the Render server (measured earlier, measuring code removed). Auto-Deploy is now Off on both Render services, so releases are manual (see "Deploying (manual)"). Did a manual deploy of both services afterwards. Next: smoke test on the live site, then the public-launch gaps (offer expiry check, password reset, privacy policy, disputes).
- 2026-10-20: Wrote the backlog from the owner's list as milestones M1 to M9 (see "Backlog and milestones"). No code changed. Next: M1.
- 2026-10-20: M1 part 1 done: new `client/src/components/SlowNotice.tsx` (shows a "server may be waking up, up to a minute" note if a request takes more than 3 seconds), used in `Login.tsx` and `Signup.tsx`. Client only, no server change. Not deployed yet (release is manual). Next: M1 part 2, the "Next step" card at the top of the deal page and the timeline newest first.
- 2026-10-21: Started a new chat for the next milestone with a handoff prompt. Updated "Starting a new chat with Claude". Next: M1 part 2, the deal page.

### Shazu's entries (the friend)

- 2026-10-18 (Shazu): Step 5, piece 5a done: the server is live on Render at `https://influencer-platform-api.onrender.com` (settings and variables are listed under "In progress", step 5a). New files: `server/scripts/make-secret.mjs` and `server/scripts/check-clipboard.mjs` (see "Helper scripts"). Added the sections "What happens if a secret is lost" and "Helper scripts", and corrected the `TRUST_PROXY` advice (don't use 1 without measuring). Checked: the build and start commands ran on Render (Node 24.22.0) and Render shows the service as Live. The first deploy failed on a malformed `PAYMENT_ENCRYPTION_KEY`. It was replaced before any data existed. Nothing to pull or run on your side; no code in `src/` changed. Next: 5b, the client as a Render Static Site, then 5c (`CLIENT_URL`) and 5d (measure `TRUST_PROXY`).
- 2026-10-18 (Shazu): Step 5, pieces 5b and 5c done. The client is live on Render as a Static Site at `https://influencer-platform-web-7qdx.onrender.com`, and `CLIENT_URL` on the server now points at it (details under "In progress", 5b and 5c). No code changed; only these notes. Checked: the local `npm run build` in `client/` passed, the Render build passed, the rewrite rule was added, and the server log shows `MongoDB connected` and no `CLIENT_URL` warning. Not checked yet: signing up and logging in on the live site (that is the start of step 6). Important before real users: `TRUST_PROXY` is still unset, so all visitors currently share one rate-limit bucket. That means 50 failed logins from anyone lock logins for everybody for 15 minutes, and 5 failed logins on one account lock it for its owner too. Do step 5d before real users arrive. Next: step 6, the smoke test, then 5d.
- 2026-10-18 (Shazu): UI redesign, milestone 1 (see "UI redesign"). Public landing page at `/` with Log in and Sign up at the top right, sun/moon theme toggle, responsive header, mobile bottom tab bar, new Login, Signup, Terms (DealDoneHai, dealdonehai@gmail.com, Bengaluru filled in; still marked Draft until a lawyer reviews it) and both dashboards, with "influencer" reworded to "creator" in visible text. Files: `client/index.html`, `client/src/index.css`, `client/src/App.tsx`, `client/src/components/{ThemeToggle,Logo,SiteHeader,MobileTabBar,SiteFooter,AppLayout}.tsx`, `client/src/pages/{Landing,Login,Signup,Terms,BrandDashboard,InfluencerDashboard}.tsx`. No server change. Checked: `npx tsc --noEmit -p tsconfig.app.json` after each file; the design preview was checked at 1440, 820, 390 and 360 px wide in light and dark with no sideways scroll. The other pages still have their old layout inside the new colours until the next milestone. Next: restyle the remaining pages.
- 2026-10-18 (Shazu): UI redesign, milestone 2 (see "UI redesign"). Restyled and reworded 14 more files inside the new `AppLayout`: `BrowseInfluencers`, `InfluencerDetail`, `InfluencerProfile`, `InfluencerPricing`, `BrowseBrands`, `BrandDetail`, `BrandProfile`, `CreateOffer`, `PaymentTerms`, `Deals`, `DealDetail`, `PaymentSharePanel`, `PaymentDetails`, `Messages`, plus more shared styles in `client/src/index.css`. No server change and no logic change: every API call, rule and check is the same as before (money in paise, rates visible to brands only, payment details shared for 6 hours with every view logged, barter-only deals without money). Checked: `npx tsc --noEmit -p tsconfig.app.json` after each file and a manual run-through on dev accounts. Not checked yet: the live site on a real phone. Next (see the list under "UI redesign"): `ProtectedRoute.tsx`, the favicon, a search for leftover "influencer" wording, then a phone check on the live site.
- 2026-10-19 (Shazu): UI redesign finished for code: `client/src/pages/Messages.tsx` (chat) restyled and live; `client/src/components/ProtectedRoute.tsx` (Loading text) and a new DealDoneHai favicon in `client/public/favicon.svg` (violet tile, lime tick). A search of `client/src` found no visible "influencer" wording left (only code names, comments and the ASCI guidelines line in Terms). No server change, no logic change. Checked: `npx tsc --noEmit -p tsconfig.app.json`. Not checked yet: a real phone on the live site. Next: the phone check (see "UI redesign"), then the deploy to-dos.
- 2026-10-21 (Shazu): Notes only, no code. Recorded the owner's decisions from today and the password reset plan under "Owner decisions and plans (2026-10-21)" (Render free blocks SMTP, so email needs an HTTPS email service; notification order: in-app count, then phone push, then email; the "1 MB for now" limit is unconfirmed). The live-site check of the new UI on a phone was reported done by the owner. Login rate limits on the live site were tested with `TRUST_PROXY=3`, and the owner reported the check as done. Next: M2 (payment reference optional), then M3, in the order of "Backlog and milestones".
- 2026-10-22 (Claude, with Shahzad, in a new chat): Recorded M1 part 2 here because the log had no entry for it: the deal page "Next step" card at the top (who must act, with their buttons; the other side sees "Waiting for X") and the timeline newest first. Files: `client/src/pages/DealDetail.tsx` and `client/src/index.css`, commit `678b9ee`, client only. Not written in this chat. Whether M1 is manually deployed on the live client is not confirmed. Next: M2.
- 2026-10-22 (Claude, with Shahzad): M2 done, client only. Finding: the server already accepted an empty payment reference (since 2026-10-17) and `server/scripts/payment-records-test.mjs` already tests it, so no server change and no new test were needed. The screens still forced it, so: `client/src/pages/DealDetail.tsx` (the reference box is no longer `required` and is labelled optional, the help and "Next step" texts say it is optional, and a payment without one shows "No reference given."), `client/src/components/PaymentTerms.tsx` and `client/src/components/PaymentSharePanel.tsx` (one sentence each). A reference that is typed in must still be 6 to 30 letters, digits or dashes and cannot be reused on the same deal (server rule, unchanged). Checked: for `DealDetail.tsx`, `npx tsc --noEmit -p tsconfig.app.json`, `node scripts/payment-records-test.mjs` and a browser run (the owner reported all passed); the other two files are one-sentence text changes, covered by the type check run before the commit. Not deployed: this is client only, so only the client needs the manual deploy. Still to do: Terms section 4 still says the brand "enters a payment reference (such as a UTR)". Change it in the M3 Terms update so the legal text is edited once. Also recorded the owner's answer on the "1 MB" limit (see "Owner decisions and plans"): a wanted feature, not built, still unconfirmed what it applies to. Next: M3, starting with the question to confirm (creator must have saved payment details before accepting a paid offer).
- 2026-10-22 (Codex, with Shahzad): Added the existing spinning ring beside the slow-server note in `client/src/components/SlowNotice.tsx` and styled it in `client/src/index.css`. No server behavior changed. Checked: `npx.cmd tsc --noEmit -p tsconfig.app.json` and `npm.cmd run build` in `client/` passed. The component `client/src/components/Spinner.tsx` was already untracked in the workspace and was used without editing. M3 decision is confirmed: saved payment details are optional at signup but required before accepting a paid offer. M6 limit is confirmed: draft videos after a restaurant/place visit are capped at 1 MB for now due to the free tier. Not yet visually checked in a browser. Next: M3, server acceptance enforcement.
- 2026-10-22 (Codex, with Shahzad): M3 started. `server/src/modules/deals/deal.routes.ts` now requires saved payment details before a creator can accept a paid offer; the check is server-side and barter acceptance remains allowed. `server/scripts/payment-share-test.mjs` now covers both cases and verifies the paid offer stays `OFFERED` when blocked. Checked: `npx tsc --noEmit`, `npm run build`, `npx tsx scripts/barter-transitions-test.ts`, and `node scripts/payment-share-test.mjs` passed. For the integration run, a one-time test login was generated in the process environment and never displayed; it used the local non-production database. M3 is still in progress and these changes are not committed yet. Next: continue replacing the six-hour share flow.
- 2026-10-22 (Codex, with Shahzad): Replaced `server/src/modules/payments/payment-share.routes.ts` with direct brand access at the deal's advance/final due stage. The server checks the brand/deal relationship and paid deal status, decrypts only after authorization, sends `Cache-Control: no-store`, and records each successful view in the existing audit log. The participant log endpoint no longer returns active shares. Replaced `server/scripts/payment-share-test.mjs` to cover stage gating, role/deal authorization, paise amount and UPI URI, repeated-view logging, no-store, removed share endpoint, and retained audit history after deletion. Checked: `npx tsc --noEmit`, `npm run build`, `node --check scripts/payment-share-test.mjs`, and the payment-share integration script passed. Tests ran against the local non-production database with a temporary process-only test login. M3 is still in progress. Next: update the client payment panel and payment-details/offer/Terms text.
- 2026-10-22 (Codex, with Shahzad): Replaced `client/src/components/PaymentSharePanel.tsx` to remove six-hour share controls and show the brand a direct payment-details action at the advance/final due stage. Creator text explains stage access and links to add saved details if missing; the panel keeps the access log and displays paise amounts, account details, and UPI QR/link after viewing. Checked: first-line check and `npx tsc --noEmit -p tsconfig.app.json` in `client/` passed. M3 is still in progress; visual/browser check remains for milestone completion. Next: update the payment-details, offer and Terms text.
- 2026-10-22 (Codex, with Shahzad): Updated `client/src/pages/PaymentDetails.tsx` to explain direct brand access at the relevant payment stage and that each view is recorded; deletion confirmation now describes the effect on future views, with no reference to a temporary share. Checked: first-line check and `npx tsc --noEmit -p tsconfig.app.json` in `client/` passed. M3 remains in progress. Next: update the remaining offer/payment terms and Terms text.
- 2026-10-22 (Codex, with Shahzad): Updated `client/src/components/PaymentTerms.tsx` to explain that brands can view saved payment details at the relevant payment stage and each view is recorded. Checked: first-line check and `npx tsc --noEmit -p tsconfig.app.json` in `client/` passed. M3 remains in progress. Next: update the Terms text.
- 2026-10-22 (Codex, with Shahzad): Updated `client/src/pages/Terms.tsx`: payment references are optional, creators may add payment details after signup but must save them before accepting a paid offer, and brands can view saved details at the relevant advance/final stage with each view recorded. Removed the six-hour share terms and updated the revision date to 2026-10-22. Checked: first-line check and `npx tsc --noEmit -p tsconfig.app.json` in `client/` passed. Terms remain a draft pending lawyer review. A client search found one stale six-hour statement in `client/src/pages/Landing.tsx`; next: update that copy, then verify the flow in a browser before the manual client deploy.
- 2026-10-22 (Codex, with Shahzad): Updated `client/src/pages/Landing.tsx` to describe payment details as available to the brand at the relevant payment stage, with each view logged. Checked: first-line check and `npx tsc --noEmit -p tsconfig.app.json` in `client/` passed. A search of `client/src` found no remaining six-hour share wording. M3 remains in progress; next: verify the flow in a browser before the manual client deploy.
- 2026-10-22 (Codex, with Shahzad): Updated `client/src/pages/InfluencerDashboard.tsx` to say saved payment details are available to brands when payment is due. Checked: first-line check and `npx tsc --noEmit -p tsconfig.app.json` in `client/` passed. M3 remains in progress; next: browser check of the paid-offer acceptance and stage-based payment-details flow, then manual deploy (server first, then client).
- 2026-10-22 (Codex, with Shahzad): Notes-only clarification: updated “Rules the code follows”, “Done”, and M3 in “Backlog and milestones” to describe stage-based payment-detail access accurately. M3 implementation is on `main`; browser verification and manual server-then-client deployment remain. Also removed the completed M3 Terms copy update from the separate pending list; lawyer review remains. Checked the edited sections against the current M3 routes and UI; no tests apply to this notes-only change. Next: browser check and manual deployment.
- 2026-10-22 (Codex, with Shahzad): Recorded the owner's report that the M3 browser check passed. Client production build also passed (`npm run build`); server type/build and payment tests had passed earlier. M3 is ready for the manual release; deploy the server first, then the client, and confirm both show Live.
- 2026-10-22 (Codex, with Shahzad): M3 manual deployment completed, reported by the owner. Verified `https://influencer-platform-api.onrender.com/api/health` returned HTTP 200 with status `ok`, and `https://influencer-platform-web-7qdx.onrender.com/` returned HTTP 200. Updated M3 and M2 deployment status above. M3 is done. Next: M4 notifications; no start-of-milestone questions are listed for M4.
- 2026-10-22 (Codex, with Shahzad): M4 started. Added `server/src/modules/notifications/notification.model.ts` with separate notification documents for recipient, deal, actor, deal action, and read time, plus an index for unread/newest-per-user queries. Checked: first-line check, `npx tsc --noEmit`, and `npm run build` in `server/` passed. This schema-only piece has no standalone existing test script. Next: create and emit notifications from successful deal transitions.
- 2026-10-22 (Codex, with Shahzad): Updated `server/src/socket.ts` so each authenticated socket joins its own user room based on the verified JWT and can receive `notification:new` events. Conversation-room authorization and chat events are unchanged. Checked: first-line check, `npx tsc --noEmit`, and `npm run build` in `server/` passed. A notification integration test will be added with the transition wiring. Next: create and emit notifications after successful deal transitions.
- 2026-10-22 (Codex, with Shahzad): Updated `server/src/modules/deals/deal.routes.ts` to create a notification for the other participant after a deal action successfully passes the compare-and-set, then emit the saved notification to that user's Socket.io room. All deal actions are recorded; persistence/delivery failure does not make an already-saved deal action appear to fail. Checked: first-line check, `npx tsc --noEmit`, and `npm run build` in `server/` passed. Integration test coverage remains to be added with the notification API. Next: add authenticated notification list, unread count, and read routes.
- 2026-10-22 (Codex, with Shahzad): Added `server/src/modules/notifications/notification.routes.ts` with authenticated list/unread-count and mark-read handlers. Responses are scoped to the signed-in recipient, the list is capped at 50 newest entries, and repeated mark-read requests are safe. Checked: first-line check, `npx tsc --noEmit`, and `npm run build` in `server/` passed. The route module is not mounted yet; integration coverage will be added with the complete API. Next: mount `/api/notifications` in `server/src/index.ts`.
- 2026-10-22 (Codex, with Shahzad): Mounted `server/src/modules/notifications/notification.routes.ts` at `/api/notifications` in `server/src/index.ts`, behind the existing API rate limit. Checked: first-line check, `npx tsc --noEmit`, and `npm run build` in `server/` passed. Integration coverage will be added with the complete API. Next: add the notification integration script and verify list, unread count, read ownership, and transition delivery.
- 2026-10-22 (Codex, with Shahzad): Added `server/scripts/notifications-test.mjs` to cover notification creation and socket delivery after a barter acceptance, recipient/outsider privacy, unread count, and idempotent mark-read behavior. It creates random temporary accounts in process, cleans up its test deal, notifications and accounts, and refuses the named production database. Checked: first-line check, `node --check scripts/notifications-test.mjs`, and the integration run passed against the local non-production database (all 15 checks passed). Temporary emails/passwords were not printed or saved.
- 2026-10-22 (Codex, with Shahzad): Added `client/src/components/NotificationBell.tsx` with notification loading, live `notification:new` updates, unread count, deal links, mark-read behavior, and creator confirmation for advance/final payment notices using the existing deal actions. Checked: first-line check, `npx.cmd tsc --noEmit -p tsconfig.app.json`, and `npm.cmd run build` in `client/` passed. The component is not yet placed in the header and its dropdown styles are pending. Next: add the bell to the desktop header and style the notification panel.
- 2026-10-22 (Codex, with Shahzad): Added `NotificationBell` to the signed-in desktop header in `client/src/components/SiteHeader.tsx`. Checked: first-line check, `npx.cmd tsc --noEmit -p tsconfig.app.json`, and `npm.cmd run build` in `client/` passed. Notification dropdown and badge styling, plus mobile navigation placement, are pending. Next: style the bell and dropdown in `client/src/index.css`.
- 2026-10-22 (Codex, with Shahzad): Styled the notification unread badge, dropdown panel, newest-first notification rows, unread state, and payment-confirm button in `client/src/index.css`, using the existing light/dark theme tokens. Checked: first-line check, `npx.cmd tsc --noEmit -p tsconfig.app.json`, and `npm.cmd run build` in `client/` passed. Not visually checked in a browser yet. Next: add notification access to mobile navigation, then visually check the complete M4 UI.
- 2026-10-22 (Codex, with Shahzad): Added an Alerts entry to the mobile tab bar in `client/src/components/MobileTabBar.tsx`, reusing the notification bell and unread count. Checked: first-line check, `npx.cmd tsc --noEmit -p tsconfig.app.json`, and `npm.cmd run build` in `client/` passed. The six-item mobile layout and dropdown position need CSS styling next; no browser check yet.
- 2026-10-22 (Codex, with Shahzad): Styled the six-item mobile tab bar's Alerts button and positioned its notification panel above the bar in `client/src/index.css`; the desktop-header bell is hidden on narrow screens so there is one visible bell on phones. Checked: first-line check, `npx.cmd tsc --noEmit -p tsconfig.app.json`, and `npm.cmd run build` in `client/` passed. Browser verification of M4 is still pending; the server was unchanged.
- 2026-10-22 (Codex, with Shahzad): Confirmed creator brand search returns only brands with saved `BrandProfile` documents; a brand must save its profile to appear. Found that creating an offer (`POST /deals`) did not emit a notification, while later deal actions did. Extended `server/src/modules/notifications/notification.model.ts` to allow the separate `createOffer` notification action without changing the deal transition table. Checked: first-line check, `npx.cmd tsc --noEmit`, and `npm.cmd run build` in `server/` passed. Next: create and emit an offer notification, then cover it in the integration script.
- 2026-10-22 (Codex, with Shahzad): Updated `server/src/modules/deals/deal.routes.ts` so successful brand offer creation saves a `createOffer` notification for the creator and emits it through the creator's authenticated Socket.io room. Notification failure does not make a saved deal offer appear to fail. Checked: first-line check, `npx.cmd tsc --noEmit`, `npm.cmd run build`, `node --check scripts/notifications-test.mjs`, and the existing notification integration script passed. The integration script still needs explicit assertions for the new offer-created event. Next: add those assertions and verify creator visibility/unread count and realtime delivery.
- 2026-10-22 (Codex, with Shahzad): Extended `server/scripts/notifications-test.mjs` to verify that offer creation persists a `createOffer` notification for the creator, updates unread count, emits live only to the creator, and is not sent to the brand actor or an outsider. Checked: first-line check, `npx.cmd tsc --noEmit`, `node --check scripts/notifications-test.mjs`, and the integration run passed (22 checks) against the local non-production database; random temporary accounts and test deal were cleaned up. Next: recheck the creator laptop notification flow after the server and client M4 code are manually deployed.
- 2026-10-22 (Codex, with Shahzad): Recorded the owner's report that after deployment, new creator offer notifications work on the laptop and brand notifications work on mobile. Brand search was also resolved by saving the brand profile. Remaining M4 browser check: on a paid deal, test the payment notification's confirmed "Yes, received" action. No code changed in this entry.
- 2026-10-22 (Codex, with Shahzad): M4 notifications complete. The owner reported that the quick payment notification's confirmed "Yes, received" browser check passed. Mobile and laptop notifications and creator offer notifications had passed earlier. The server/client deployment and 22-check server integration script are recorded above. Next: M5 WhatsApp-style chat; ask the start-of-milestone question about showing conversations only.
- 2026-10-22 (Codex, with Shahzad): M5 started; the owner confirmed the list should show existing conversations only. Added `brandLastReadAt` and `influencerLastReadAt` timestamps to `server/src/modules/chat/conversation.model.ts` as the basis for participant-specific unread counts. Checked: first-line check, `npx.cmd tsc --noEmit`, and `npm.cmd run build` in `server/` passed. No standalone model test applies. Next: calculate per-conversation unread counts in the authenticated conversation list.
- 2026-10-22 (Shazu): Updated `server/src/modules/chat/chat.routes.ts` so the authenticated conversations list includes each conversation's unread message count and an `unreadTotal`, using the participant-specific last-read timestamp and excluding messages sent by the current user. Checked: first-line check, `npx tsc --noEmit`, and `npm run build` in `server/` passed. No existing script covers these new counts yet; integration coverage is next. M5 remains in progress. Next: add the mark-as-read route and verify unread counts/read ownership with a server script.
- 2026-10-22 (Shazu): Added `PATCH /chat/conversations/:id/read` in `server/src/modules/chat/chat.routes.ts`. It checks membership with the existing participant-scoped lookup, updates only the signed-in participant's read timestamp, and returns the time recorded. Checked: first-line check, `npx tsc --noEmit`, and `npm run build` in `server/` passed. A focused integration script for read ownership and unread-count changes remains to be added. M5 remains in progress. Next: add server integration coverage for unread counts, read behavior, and participant isolation.
- 2026-10-22 (Shazu): Added `server/scripts/chat-unread-test.mjs` for M5. It creates random temporary brand/creator/outsider accounts, checks incoming unread count, mark-read behavior, sender exclusion, and outsider/unauthenticated access, then cleans up; it refuses the production database and prints no credentials. Checked: first-line check, `node --check scripts/chat-unread-test.mjs`, and the integration run passed all 10 checks against the local non-production database. M5 remains in progress. Next: wire the mark-as-read endpoint into the client when a conversation is opened.
- 2026-10-22 (Shazu): Updated `client/src/pages/Messages.tsx` to call the authenticated mark-read endpoint after joining an opened conversation and when a new message arrives in the open conversation; the matching row unread count clears after the server confirms. Checked: first-line check, `npx tsc --noEmit -p tsconfig.app.json`, and `npm run build` in `client/` passed. API behavior is covered by the M5 chat unread integration script; browser check remains for milestone completion. Next: show unread styling and per-conversation badges in the chat list.
- 2026-10-22 (Shazu): Updated `client/src/pages/Messages.tsx` to mark unread conversation rows, show an accessible per-conversation unread count badge, and retain the active-row state. Checked: first-line check, `npx tsc --noEmit -p tsconfig.app.json`, and `npm run build` in `client/` passed. Badge/unread typography styling in `client/src/index.css` is the next piece. M5 browser verification remains for milestone completion.
- 2026-10-22 (Shazu): Styled M5 unread conversation rows and round lime count badges in `client/src/index.css`; unread names and previews use stronger text weight, and the title row handles long names. Checked: first-line check, `npx tsc --noEmit -p tsconfig.app.json`, and `npm run build` in `client/` passed. Visual browser check remains for M5 completion. Next: show the aggregate unread total on the desktop and mobile chat navigation, with live updates.
