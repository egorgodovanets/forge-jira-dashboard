# Forge Jira Dashboard

A Jira Cloud app built on Atlassian Forge. It adds a global page with a task history dashboard backed by Forge SQL:

- a paginated table of task status changes (product, task, transition, date);
- filters by date range, product and target status, applied to everything on the page;
- two charts: events by target status and status changes per day;
- PDF export of the current selection, including the filters summary, both charts and all matching rows.

## Data model

Three related tables live in Forge SQL (MySQL-compatible), created by `src/migrations.js`:

```text
products 1 ── * tasks 1 ── * tasks_history
```

| Table | Columns | Indexes |
|---|---|---|
| `products` | `id`, `name`, `organization`, `state` (active / archived), `created_at` | primary key |
| `tasks` | `id`, `product_id`, `name`, `description`, `status`, `assignee`, `created_at`, `due_date` (nullable) | `product_id`, `created_at`, `status` |
| `tasks_history` | `id`, `task_id`, `from_status` (null for task creation), `to_status`, `changed_at` | `task_id`, `changed_at` |

Statuses: `open`, `in_progress`, `review`, `testing`, `done`. All timestamps are stored in UTC.

## Project structure

```text
manifest.yml              Forge modules: global page, resolver, SQL, migration triggers + queue, seed webtrigger
src/
  index.js                Resolvers used by the UI (history page, chart data, PDF export rows)
  migrations.js           Schema migrations (migrationRunner), run on install/upgrade and hourly
  generateData.js         Deterministic test data generator (pure JS, no database access)
  seed.js                 Webtrigger handler: clears tables and inserts generated data in batches
static/hello-world/       Custom UI frontend (React, Recharts, jsPDF)
  src/
    App.js                Dashboard page: wires filters, data loading and blocks together
    App.css               Styles (Atlassian Design System colors and sizes)
    constants/status.js   Status labels and colors
    hooks/                useInvoke (resolver calls), useFilters, usePdfExport
    components/           FiltersBar, HistoryTable, Pagination, StatusLozenge, Loading, charts/
    pdf/                  buildHistoryPdf (report layout), chartToPng, drawTransition
```

## Setup

Requirements: Node.js 22.23.4+ / 24.22.1+ (required by Forge CLI 15), Forge CLI (`npm install -g @forge/cli`), `forge login`, and a Jira Cloud site where you are an admin (a free developer site works).

1. Install dependencies:

   ```bash
   npm install
   cd static/hello-world
   npm install            # add --legacy-peer-deps if npm reports an ERESOLVE peer conflict
   ```

2. Build the frontend and deploy:

   ```bash
   npm run build          # inside static/hello-world
   cd ../..
   forge deploy
   ```

3. Install the app on your site:

   ```bash
   forge install --site <your-site>.atlassian.net --product jira
   ```

4. Check the schema. Installing the app fires `avi:forge:installed:app`, which queues the migrations, so the tables appear within a minute or so. An hourly scheduled trigger runs the same migrations as a fallback (for example after minor deploys, which fire no lifecycle event). Check in Developer Console → your app → SQL → Manage → Schema details (3 tables, migrations `v001`–`v003`).

5. Seed test data. Get the webtrigger URL and call it:

   ```bash
   forge webtrigger create          # select the installation and seed-webtrigger
   curl -X POST -H "Content-Type: application/json" -d "{}" <webtrigger-url>
   ```

   Expected response: `{"products":15,"tasks":1400,"history":5060,"durationMs":...}`. Seeding is idempotent: every call clears the tables and inserts the same data again. Dates are generated relative to the moment of seeding (the last 180 days).

6. Open the app in Jira: **Apps** → **forge-jira-dashboard**.

After code changes: rebuild the frontend if it changed, then run `forge deploy`. `forge install --upgrade` is only needed when scopes or modules in `manifest.yml` change.

## Technical decisions

**Custom UI instead of UI Kit.** Charts (Recharts) and client-side PDF generation (jsPDF) need a real DOM and arbitrary React components, which UI Kit does not allow.

**Filtering and aggregation in SQL.** The frontend never loads the whole history. The table gets one page (10 rows) plus a total count, and the charts get already aggregated rows (`GROUP BY to_status` and `GROUP BY DATE(changed_at)`).

**One WHERE builder for everything.** `buildHistoryWhere` turns UI filters into a WHERE clause used by the table, both charts and the export, so all of them always show the same selection.

**Safe queries.** Filter values go through `?` placeholders. Status is checked against a whitelist and dates against `YYYY-MM-DD`; invalid filters are ignored. `LIMIT`/`OFFSET` are interpolated only as integers computed on the server.

**PDF export on the client.** The `getHistoryExport` resolver returns all matching rows without pagination, capped at 10,000 rows to stay within Forge response limits (a `truncated` flag is shown in the PDF if the cap is hit). The PDF is built in the browser with jsPDF and jspdf-autotable. Charts are converted from Recharts SVG to PNG via canvas.

**Request handling in the UI.** A small `useInvoke` hook tracks loading and error state per request and ignores stale responses, so fast pagination or filter changes never show data from an older request. A failed request only affects its own block.

**Test data.** `generateData.js` is deterministic (seeded PRNG, seed 42) and runs locally without Forge. A task's status is derived from its generated history, so `tasks.status` always matches the last `to_status`. `seed.js` inserts rows in sequential batches of 500 (parents first), deletes children first, and verifies row counts after inserting.

**No foreign keys.** Relations are kept by the seed order instead of database constraints. IDs are assigned by the generator rather than `AUTO_INCREMENT`, which keeps the data reproducible.

## Known limitations and possible improvements

- **The seed webtrigger is a dev-only tool with no authentication.** In production it should be removed from `manifest.yml` or protected.
- Lifecycle events cover a new install and major upgrades only. A new migration shipped in a minor deploy is applied by the hourly fallback, so it can take up to an hour.
- Days without events are absent from the daily chart rather than shown as zero.
- `OFFSET` pagination is fine at this scale. For millions of rows, keyset pagination (by `changed_at, id`) would be faster.
- Very large exports would be better generated on the server or in the background.
- Dates are shown in UTC. Converting them to the user's timezone would be friendlier.
- Next steps for the codebase: migrate the frontend from Create React App to Vite and TypeScript, and add unit tests for `generateData` and `buildHistoryWhere`.
