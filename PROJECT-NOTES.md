# Influencer platform: project notes

Last updated: 2026-10-17. Repo: github.com/shahzad-07/influencer-platform (public, so never commit a `.env` file). Shahzad and a friend both work on `main`.

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
  - Counts live in server memory. Restarting the server clears them (handy if you lock yourself out while testing). This only works for one server instance.
  - Optional env vars: `TRUST_PROXY=1` (set it when the server is behind a hosting proxy) and `RATE_LIMIT_OFF=1` (local testing only, never in production).

## In progress: step 4 (Terms page + rate limiting)

## it’s done (move it into the “Done” list).

Rate limiting is done and tested. Three client files are left:

1. `client/src/pages/Terms.tsx` (new). A public page in plain language, built from how the platform really works: marketplace only, payments happen outside the app and the app only records them, payment details stored encrypted and shared for 6 hours with every view logged, barter deals, offers expire after 7 days, disputes freeze a deal, account and conduct rules, endorsement disclosure, limits of liability, governing law of India, contact. Put the business name, contact email, city and last-updated date in one block at the top of the file. Mark it as a draft. A lawyer must review it before launch.
2. `client/src/App.tsx`: add the public route `/terms` (no `ProtectedRoute`).
3. `client/src/pages/Signup.tsx`: a required "I agree to the Terms" checkbox with a link that opens `/terms` in a new tab.
   Then do the git step.

## Next

5. Free-tier deploy. Things to remember: use a separate production database, never the dev one. Environment variables are `PORT`, `MONGODB_URI`, `JWT_SECRET`, `PAYMENT_ENCRYPTION_KEY`, `CLIENT_URL`, plus `TRUST_PROXY=1` on the server and `VITE_API_URL` on the client. Check that CORS and Socket.io allow only the real client URL. Atlas Network Access must allow the host.

Later: brand subscription gate, dashboards, reviews and reputation, notifications, phone OTP, open campaigns, counter-offers, multiple deliverables, rate cards, chat upgrades, availability toggle, deal agreement, admin/disputes and the offer-expiry job.

Not wanted: reel uploads, SEO/growth pages, AI helper.

## Security and legal to-dos

- Some test scripts (at least `portfolio-test.mjs` and `language-test.mjs`) have a default test email and password written in them, and the repo is public. Change that test account's password, then use only the `INFLUENCER_EMAIL` / `INFLUENCER_PASSWORD` environment variables with no defaults. Never use test accounts on the production database.
- The Terms checkbox is only checked in the browser. Later, record on the server when each user accepted and which version.
- A privacy policy is also needed (personal data, India's DPDP Act). Get both documents reviewed by a lawyer.
- Chat messages are not rate limited, and Socket.io is not covered by the limiter.

## Known gotchas

- Atlas blocks the IP when it changes (Network Access).
- In Git Bash, `node` inside `$(...)` fails (not a tty), and long pasted commands get mangled.
- Pasting several files at once once put code in the wrong files, so do one file at a time.
- Before replacing a file, make sure you have the latest version. Local files can be ahead of what a chat was shown.

## Test scripts

Run in `server/`, with the server running (`npm run dev`):

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

- 2026-10-17: Rate limiting finished and tested. Languages finished. Payment terms done. Terms page (Terms.tsx, the /terms route, the Signup checkbox) is next. Started using this log.

### Friend's entries

- (add your first entry here)

### Shahzad's entries

- 2026-10-17: Terms page (Terms.tsx), public /terms route in App.tsx, and the required "I agree to the Terms" checkbox in Signup.tsx. Step 4 is finished. Still to do: fill in the business name, email and city at the top of Terms.tsx, and get the text reviewed by a lawyer. Next: step 5, free-tier deploy.
