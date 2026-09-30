# Friends Included finance system

An intentionally simple finance system for the fictional **Friends Included Ltd** wedding-guest business. Supabase will be the source of truth; Vercel hosts the website; Google Sheets is a readable one-way copy; Telegram is used for bot submissions and notifications.

## Phase 1 implementation checklist

- [x] Translate the complete homework specification into this foundation and database plan.
- [x] Create a Vercel-ready Next.js App Router application.
- [x] Add the five-person demonstration-role selector and role-aware navigation.
- [x] Establish server-side authorization helpers for every future write/decision route.
- [x] Design a Supabase migration covering records, decisions, Telegram identities and delivery, and Sheets sync/retry status.
- [x] Create the Supabase project and run the migrations through Phase 4.
- [x] Implement the shared website transaction service, including validation, duplicate prevention, calculations, and repeat-decision protection. Telegram will call this same layer in a later phase.
- [x] Build the website forms, manager decisions, dashboard queries, visibility rules, and Supabase persistence.
- [x] Connect Telegram bot identity setup, submissions, confirmations, and decision retries.
- [x] Connect Google Sheets two-tab upsert/retry sync.
- [x] Publish the safe source to GitHub and deploy the integrated application to Vercel. Official S01–S05/E01–E07 records remain intentionally deferred.

## What Phase 1 contains

The home page contains all five fictional employees in a **Demonstration role** selector, an intentionally empty dashboard, and navigation for sales, expenses, and approvals. The pages are scaffolds, not fake transaction simulations. The selected role is stored in a signed-in-session replacement cookie only for the homework demonstration. Every future server action/route must call `requireRole`; client-side visibility is not the authority.

## Database design

Run [`supabase/migrations/0001_initial_schema.sql`](supabase/migrations/0001_initial_schema.sql) in the Supabase SQL Editor or through the Supabase CLI after creating the project. It provides:

- `employees` — five fictional people and their roles.
- `telegram_identity_links` — manager-created, auditable Telegram user/chat links; no self-assignment path.
- `sales` and `expenses` — immutable submission facts, original proposals, current status, and the submission chat snapshot.
- `sale_commission_decisions` and `expense_allocation_decisions` — original and manager-final decisions, preserving the audit trail and preventing an approved record from being altered.
- `google_sheets_sync_status` and `telegram_notification_status` — independent delivery state and retry history keyed by record/recipient/event.

Amounts use `numeric(12,2)`, timestamps use UTC, references are globally unique across sales and expenses, and database checks enforce valid projects, categories, positive amounts, commission percentages, and allocation states. Later server code calculates rather than stores dashboard totals, so any valid future transaction changes results naturally.

## Local setup

1. Install Node.js 20.9 or later.
2. Copy `.env.example` to `.env.local` and add the required Supabase, Telegram, and Google server credentials. Never commit this file.
3. Run `npm install`.
4. Run `npm run dev`, then open [http://localhost:3000](http://localhost:3000).
5. Before persistence work, create a Supabase project and execute the migration named above.

Useful checks:

```bash
npm run typecheck
npm run lint
npm run build
```

## What you will need for Phase 2 and final deployment

1. A Supabase project URL, publishable key, and service-role key (server-only), plus permission to create/run the schema migration.
2. A Telegram bot token from BotFather, the bot’s public `t.me/...` link, and a public HTTPS Vercel URL for the webhook. You will also need to start the bot in a private chat before testing and provide its manager setup access decision.
3. A Google Cloud project where you can enable Google Sheets API, create/download a service-account credential, and create a spreadsheet with `Sales` and `Expenses` tabs. Provide its spreadsheet ID and share it as Editor with the service-account email; later share Viewer access with the instructor.
4. A GitHub repository you own (or approval to create one) and the name to display on the Vercel page. For deployment, access to your Vercel account/project is required.
5. The instructor-accessible Google Sheets link and GitHub repository link to place on the completed site, plus permission to submit the final Vercel URL to the course spreadsheet.

## Important safeguards

- No credentials belong in Git, the website, or the sheet.
- Website and Telegram must call the same service layer in Phase 2; neither will use hard-coded homework totals.
- Google Sheets is copy-only: its edits never write back to Supabase.
- A failed Sheet sync or Telegram delivery never rolls back a saved transaction or manager decision. Retries use the same reference/event and update rather than duplicate records.
# Phase 3 — real Telegram integration

Bot: https://t.me/friends_included_homework_bot

## Run locally

1. Keep the bot token in `.env.local` as `TELEGRAM_BOT_TOKEN`. Never put it in a `NEXT_PUBLIC_` variable, Git, a screenshot, or a message to Codex.
2. Apply `supabase/migrations/0002_telegram.sql` after migration 0001. This was applied to the homework Supabase project on 28 September 2026.
3. Run `npm install`, then `npm run dev` for the website.
4. In another terminal in this folder, run `npm run telegram:poll`. Keep that terminal open. Run only one receiver. Ctrl+C stops it. The receiver registers the bot command menu and refuses to run if a webhook is active.
5. Open the bot in a **private** Telegram chat and press Start. On the website select Svetlana → Telegram setup & delivery. Copy the user ID shown by the bot, select one of the five fictional employees, and save the link.
6. Send `/sale` or `/expense` for the required message format. Fill every field, separated by `|`. Only salespeople can submit sales and only Kevin can submit expenses. The bot never accepts a self-selected employee or role.

The website role selector is intentionally demonstration access, not production authentication. Anyone testing the homework can select Svetlana; do not use this app with real financial data.

## Delivery, approvals, and retry

- Transactions and their confirmation queue entries commit together in Supabase. A Telegram network failure cannot undo a saved transaction.
- Each bot transaction stores the original chat and submitter permanently. Re-linking an account changes only future submissions. Telegram update IDs also prevent redelivery from creating a second transaction.
- Manager decisions now update transaction status and queue the decision notification in one database transaction. They preserve the original proposals, show old → new values in messages, and refuse repeated approval.
- For website transactions, the current linked chat is resolved when each event is created. Missing recipients show **No Telegram recipient linked** in Telegram setup & delivery. Link the employee and retry there.
- The local receiver drains pending notifications. Website submissions/decisions also attempt delivery immediately. Failed deliveries are shown with a manager-only **Retry delivery** button. Only a successful Telegram response is marked sent; attempts and message IDs are recorded separately.
- Delivery claims prevent simultaneous workers from sending the same event. An interrupted attempt becomes claimable after 90 seconds. Telegram cannot guarantee exactly-once message delivery after a lost network response: a retry may repeat a message, but never the financial transaction.
- Nonfinancial help/error replies can be requested again by resending the command. Polling does not advance past a transport failure. No fake messages replace Telegram API calls.

## Production Telegram webhook

Production uses `/api/telegram/webhook`, validates Telegram's secret header, and calls the same `processTelegramUpdate` service as local polling. Run `npm run telegram:webhook` after changing the production URL or bot token; never run the local poller while the webhook is active. The official S01–S05/E01–E07 tests remain deferred.

## Phase 3 verification

`npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:phase3`.

The Phase 3 check uses the real Supabase database and the shared processing functions, plus a real rejected Telegram request to chat ID 0. It checks role denials, required fields, positive amounts, invalid splits, duplicate references, staff visibility, immutable destinations, atomic decisions, rounding priority, failed delivery and retry. It creates uniquely named TEMP records and removes only those records in `finally`. Stop the poller while running this check to keep delivery-attempt assertions deterministic.

The separate live browser test submitted a temporary sale as Richard and an expense as Kevin through the actual bot, received both confirmations, changed the account link between submissions, and received changed-split/changed-allocation notifications from website approvals. These practice transactions are removed after verification; their Telegram chat messages remain. No official test records were inserted.

---
# Phase 4 — Google Sheets integration

Google Cloud project and service account are created. The private key was imported into ignored `.env.local`; `.secrets/` is also ignored. The restricted spreadsheet is shared with only the service account as Editor. Instructor Viewer access still needs the instructor email address.

Implementation added:
- `0003_google_sheets.sql`: transactional export queue, version tracking, reserved row numbers and worker leases. Apply after migration 0002.
- The shared website/Telegram submission and manager-decision functions attempt automatic export after committing to Supabase.
- `/sheets`: own-record sync states for staff; all records and retry for Svetlana.
- `npm run sheets:setup`: initialize the two existing homework tabs and readable headers/formats. Refuses unexpected tab layouts.
- `npm run sheets:worker`: recover pending deliveries after interrupted requests. Failed deliveries require manager retry, avoiding repeated requests with broken credentials.

Set `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` only in `.env.local` locally and server-side deployment environment variables later. No Google credential uses a `NEXT_PUBLIC_` prefix.

Rows are found by reference, not appended. Database-reserved row numbers protect new rows against duplicate concurrent retries. Keep this export spreadsheet read-only for human viewers: do not insert/delete/reorder rows or manually edit references. A conflicting row is reported as failed instead of overwriting another transaction. Blank gaps between records are safe. Pending sales export blank approved percentages and zero commissions. Google failure never rolls back financial data.

Verified against the real Supabase project and real Google spreadsheet: create, decision update, visible failure, retry, repeated-retry idempotency, and manager-only retry. Normal Vercel requests attempt sync immediately; failed jobs remain durable and Svetlana can retry them from `/sheets`. Temporary test transactions and rows were removed.

---
# Phase 5 — published deployment

- Live site: https://friends-included-finance-jet-five.vercel.app
- GitHub: https://github.com/tori-vi/friends-included-finance
- Telegram: https://t.me/friends_included_homework_bot
- Google Sheets: https://docs.google.com/spreadsheets/d/1n9s0iklJ_HCAivHjEFXgL4gvx79cDSRHz9ye9mrY4Rc/edit

The Vercel Hobby project is connected to `main`. Production secrets are stored only in Vercel's environment settings and ignored `.env.local`; public site metadata uses `NEXT_PUBLIC_` variables. Telegram runs through the HTTPS webhook, so the instructor does not need a local process. The deployed smoke test covered one website sale, one Telegram expense, both manager decisions, calculated dashboard totals, Sheets create/update, Telegram confirmation and decision delivery, and cleanup. Its temporary Supabase records and Sheet rows were removed; Telegram test messages remain as delivery evidence.

Before the official test, share the Google spreadsheet as Viewer with the instructor's specific Google email address. Then enter only the assignment's official S01–S05 and E01–E07 records.
