# Spool Tracker — Design Document

Rewrite of `filament-manager` (Postgres + Sequelize + Redux + Chakra) as a modern
TypeScript single-container app. Scope: track filament spools, print jobs,
finished prints detected from the Bambu printer over LAN, and optional projects
that group jobs into totals.

---

## 1. Goals / Non-goals

**Goals**
- Single-user filament tracking: spools, per-spool job history, cost tracking.
- Printer-based detection of finished prints (Bambu LAN), committed to a spool manually.
- Optional **projects**: group jobs (e.g. prints for a friend) and see total
  filament + cost per project. Personal prints carry no project — the feature is
  invisible unless used.
- One container to run, one file to back up, trivial to deploy behind a reverse proxy.
- The spool balance invariant (spool usage consistent with its jobs) is *enforced*, not manually kept in sync.

**Non-goals**
- No auth / multi-user. Single user, LAN/deployed VM.
- No real-time updates (staged jobs page polls; no websockets).
- No mobile app, no plugin system, no i18n.

---

## 2. Stack

| Layer            | Choice                          | Notes |
|------------------|---------------------------------|-------|
| Language         | TypeScript (ESM) everywhere     | `strict` mode |
| Backend          | Express 5                       | Serves API + built client |
| ORM / DB         | Drizzle + better-sqlite3        | Synchronous driver; WAL mode; single `.db` file |
| Migrations       | drizzle-kit                     | |
| Frontend         | React 19 + Vite                 | |
| Server state     | RTK Query                       | Tag-based invalidation fits CRUD well |
| UI               | Mantine (v7) + @mantine/form    | No Tailwind — Mantine has its own styling system |
| Validation       | Hand-written per-entity helpers | No zod. One `validateX()` per entity in the backend |
| Tests            | vitest (backend)                | In-memory SQLite |
| Dev tooling      | tsx (backend dev), npm scripts  | `concurrently` to run both in dev |
| Printer sync     | `mqtt` + `basic-ftp` (npm)      | Outbound only: MQTT :8883 + FTPS :990 to the printer |

Decisions made during planning (so future-me remembers *why*):
- **SQLite over Postgres**: single user, single process, one file to back up.
- **RTK Query over TanStack Query**: already familiar; tag invalidation is the right
  abstraction for this app's CRUD shape (a committed staged job invalidates 4 lists).
- **Mantine over shadcn/Tailwind**: complete opinionated components (modals, forms,
  notifications) without wiring up a design system.
- **No zod**: validation is ~4 entities of hand-rolled checks; a schema library is
  overkill. Keep checks in one helper per entity so they don't scatter.
- **No auth, no CORS**: single-user; prod is same-origin (express serves the client),
  dev is same-origin via the Vite proxy.

---

## 3. Architecture

```
                 ┌────────────────────────── Docker container ──────────────────────────┐
 browser ──────► │  reverse proxy (domain) ──► Express (port 8080)                      │
 (same origin)   │                              ├─ /api/*        → REST routes          │
                 │                              ├─ /*            → static client/dist   │
                 │                              └─ spool-tracker.db  (SQLite, /data vol)│
                 └───────────────────────────────────────────────────────────────────────┘
```

- Prod: browser only ever talks to the domain. Express serves the built React app and
  the API from the same origin. No CORS package.
- Dev: Vite on `:5173` with a proxy rule `/api → :8080`. Same origin in dev too.
- SPA fallback: Express 5 `app.get("/*splat", ...)` → `client/dist/index.html`
  (no regex hack needed, unlike the old app).
- Printer sync: the app dials **out** to the printer (MQTT :8883, FTPS :990, LAN
  only). The printer never calls us — no new inbound surface. (The old app's
  Orcaslicer script is dropped entirely — no more per-profile script config.)

---

## 4. Data Model

### Conventions
- IDs: `crypto.randomUUID()`, stored as TEXT PKs.
- **Units**: filament in **integer milligrams** (`*Mg`), money in **integer cents**
  (`*Cents`). Display layer converts (e.g. `mg / 1000` → `40.25 g`).
- **Timestamps**: ISO-8601 UTC strings (Drizzle `text`), formatted client-side.
  (Old app mixed `DATEONLY` and `DATE` — gone.)
- **String normalization at write time** (on create *and* edit):
  - `material` → uppercase (`PLA`)
  - `colour`, `finish` → lowercase (`black`, `satin`)
  - `brand` → trimmed + lowercase (`prusament`)
  Stored data is canonical; "Black" can never coexist with "black".
- Derived values are **never stored**: `leftMg = initialWeightMg - usedMg`,
  `jobCount = count(jobs)`, project totals = `SUM()` over member jobs.
  (Old app stored the spool ones and drifted.)

### `spools`
| column          | type    | notes |
|-----------------|---------|-------|
| id              | TEXT PK | uuid |
| name            | TEXT    | user label |
| brand           | TEXT    | normalized |
| material        | TEXT    | normalized |
| colour          | TEXT    | normalized |
| colourHex       | TEXT?   | `#rrggbb` — feeds the UI colour swatch |
| finish          | TEXT?   | normalized |
| initialWeightMg | INTEGER | |
| usedMg          | INTEGER | default 0. **Canonical balance** |
| costCents       | INTEGER | total cost of the spool |
| isFinished      | BOOLEAN | default false. Manual "retired" flag (spool put away with some left) |
| notes           | TEXT?   | free text |
| createdAt       | TEXT    | ISO |
| updatedAt       | TEXT    | ISO |

### `projects`
| column    | type    | notes |
|-----------|---------|-------|
| id        | TEXT PK | uuid |
| name      | TEXT    | |
| createdAt | TEXT    | ISO |
| updatedAt | TEXT    | ISO |

Totals (`totalFilamentMg`, `totalCostCents`, `jobCount`) are derived — `SUM()` /
`COUNT()` over member jobs, spanning any number of spools. Never stored.

### `jobs`
| column           | type    | notes |
|------------------|---------|-------|
| id               | TEXT PK | uuid |
| name             | TEXT    | |
| spoolId          | TEXT FK | → spools.id, `ON DELETE CASCADE` |
| projectId        | TEXT?   | → projects.id, `ON DELETE SET NULL`. **Nullable = the opt-in.** Deleting a project keeps its jobs (they become unassigned) |
| filamentUsedMg   | INTEGER | |
| costCents        | INTEGER | if omitted at create, derived: `usedMg * (spool.costCents / spool.initialWeightMg)` |
| date             | TEXT    | print date, ISO |
| createdAt        | TEXT    | |
| updatedAt        | TEXT    | |

Indexed: `spoolId` (history filter, per-spool totals), `projectId` (derived project totals).

### `staged_jobs`
| column         | type    | notes |
|----------------|---------|-------|
| id             | TEXT PK | uuid |
| name           | TEXT    | from printer sync or manual entry |
| filamentUsedMg | INTEGER?| grams × 1000. Nullable: printer-detected jobs with an unparseable gcode leave it blank for the user to fill at commit |
| date           | TEXT    | ISO |
| printerId      | TEXT?   | set when detected via printer sync |
| amsChannel     | INTEGER?| which AMS channel the job used (for spool pre-select) |
| createdAt      | TEXT    | for TTL pruning |

### `printers` (settings)
| column      | type    | notes |
|-------------|---------|-------|
| id          | TEXT PK | uuid |
| name        | TEXT    | label ("A1", "H2D") |
| ip          | TEXT    | LAN address |
| serial      | TEXT    | device serial (MQTT topic) |
| accessCode  | TEXT    | 8-digit LAN access code |
| model       | TEXT?   | `N2S` (A1), `O1D` (H2D/X2D), … |

### `ams_mappings` (settings)
| column    | type    | notes |
|-----------|---------|-------|
| printerId | TEXT PK | FK → printers.id, `ON DELETE CASCADE` |
| channel   | INT PK  | AMS channel (1..n) — composite PK = one mapping per (printer, channel) |
| spoolId   | TEXT FK | FK → spools.id, `ON DELETE CASCADE` — deleting the spool removes the mapping |

"Channel 2 on the A1 = this spool" — drives commit pre-select.

### Dropped from old app
- `inventories` table / `Inventory` model — dead code, no routes ever used it.
- `spools.filamentLeft`, `spools.numberOfJobs` — derived.
- `uniqid` string IDs.

### The balance invariant
Spool `usedMg` is always the sum of its jobs' `filamentUsedMg`. Enforced by making
every mutation a **single SQLite transaction** that touches both tables:

| operation        | transaction body |
|------------------|------------------|
| create job       | check spool exists · check `usedMg + amt ≤ initialWeightMg` · `usedMg += amt` · insert job |
| edit job         | `delta = oldAmt − newAmt` · check bounds · `usedMg += delta` · update job |
| delete job       | `usedMg −= amt` · delete job |
| edit spool       | check `usedMg ≤ new initialWeightMg` · update spool |

Over-draft → 400, spool untouched. (This is the old app's bug farm: `editJob`'s
zero-amount special case, `editSpool`'s missing bounds TODO — both gone by construction.)

---

## 5. API

Clean REST throughout (the old app's `/spools/create` style is abandoned —
nothing external depends on any of it; the only external client is the printer,
and the app talks *to* it, not the other way round).

### Spools
| Method | Path                    | Body / Query                | Returns |
|--------|-------------------------|-----------------------------|---------|
| GET    | `/api/spools`           | —                           | `Spool[]` (with derived `leftMg`, `jobCount`) |
| POST   | `/api/spools`           | `CreateSpoolInput`          | 201 `Spool` |
| GET    | `/api/spools/:id`       | —                           | `Spool` |
| PATCH  | `/api/spools/:id`       | partial `EditSpoolInput`    | `Spool` |
| DELETE | `/api/spools/:id`       | —                           | 204 (cascades jobs) |
| POST   | `/api/spools/:id/finish`| —                           | `Spool` (`isFinished: true`) |
| GET    | `/api/spool-attributes` | —                           | `{ brands[], materials[], colours[], finishes[] }` — `SELECT DISTINCT` for form suggestions |

`Spool` (wire shape) = DB columns + derived `leftMg`, `jobCount`.

### Jobs
| Method | Path                  | Body | Returns |
|--------|-----------------------|------|---------|
| GET    | `/api/jobs`           | — (optional `?spoolId=`) | `Job[]` |
| POST   | `/api/jobs`           | `{ spoolId, name, filamentUsed (grams), date?, cost?, projectId? }` | 201 `Job` |
| PATCH  | `/api/jobs/:id`       | partial (editing `filamentUsed` rebalances the spool; `projectId` moves it between projects) | `Job` |
| DELETE | `/api/jobs/:id`       | —    | 204 (rebalances the spool) |

`Job` (wire shape) = DB columns + `projectName?` (joined) — so lists can render
a project badge without a second fetch.

### Projects
| Method | Path                | Body             | Returns |
|--------|---------------------|------------------|---------|
| GET    | `/api/projects`     | —                | `Project[]` (with derived `totalFilamentMg`, `totalCostCents`, `jobCount`, `lastJobDate`) |
| POST   | `/api/projects`     | `{ name }`       | 201 `Project` |
| GET    | `/api/projects/:id` | —                | `Project` + `jobs[]` |
| PATCH  | `/api/projects/:id` | `{ name }`       | `Project` |
| DELETE | `/api/projects/:id` | —                | 204 (jobs kept, unassigned — `ON DELETE SET NULL`) |

### Staged jobs
| Method | Path                        | Body |
|--------|-----------------------------|------|
| GET    | `/api/stagedJobs`           | — |
| POST   | `/api/stagedJobs`           | `{ name, filamentUsed? (grams), date }` — manual entry (printer sync inserts directly in the DB layer) |
| DELETE | `/api/stagedJobs/:id`       | — |
| POST   | `/api/stagedJobs/:id/commit`| `{ spoolId, filamentUsed (grams), cost?, projectId? }` — creates the real job under `spoolId` (project if given), deletes the staged job. One transaction. |

### Settings (printers + AMS mappings)
| Method | Path                  | Body | Returns |
|--------|-----------------------|------|---------|
| GET    | `/api/printers`       | —    | `Printer[]` |
| POST   | `/api/printers`       | `{ name, ip, serial, accessCode, model? }` | 201 `Printer` |
| PATCH  | `/api/printers/:id`   | partial | `Printer` |
| DELETE | `/api/printers/:id`   | —    | 204 (cascades its `ams_mappings`; watcher stops) |
| GET    | `/api/ams-mappings`   | —    | `{ printerId, channel, spoolId, spoolName? }[]` |
| PUT    | `/api/ams-mappings`   | `{ printerId, channel, spoolId }` | 204 (upsert) |
| DELETE | `/api/ams-mappings`   | `?printerId=&channel=` | 204 |

### Error convention
- Proper status codes (old app returned 500 for almost everything, incl. a 501 for
  "not enough filament").
- 400 validation → `{ "error": "message", "issues": [{ "field", "message" }] }`
  (issues array feeds Mantine form errors per field).
- 404 not found → `{ "error": "..." }`. 500 reserved for real server errors.

---

## 6. Backend Design

```
backend/
  src/
    index.ts            # express app, static client, SPA fallback, startup staged-job prune
    db/
      schema.ts         # drizzle schema (tables above)
      client.ts         # better-sqlite3 (WAL) + drizzle instance; path from DATA_DIR env
      migrate.ts        # drizzle-kit migrations run on boot (idempotent)
    routes/
      spools.ts
      jobs.ts
      projects.ts
      stagedJobs.ts
      printers.ts       # /printers + /ams-mappings settings endpoints
    logic/
      spools.ts         # balance-safe mutations (transactions live here)
      jobs.ts
      projects.ts
      stagedJobs.ts
    printer/
      watcher.ts        # one MQTT connection per printer: pushall + delta merge,
                        # gcode_state transition tracking, reconnect w/ backoff
      ftps.ts           # fetch job file from the printer
      gcode.ts          # header parser: object name, grams, AMS channel usage
    validate/
      spool.ts          # validateCreateSpool / validateEditSpool → typed data | { issues }
      job.ts
      project.ts
      stagedJob.ts
      printer.ts
  drizzle/              # generated migration SQL
```

- **Validation**: `validateX(body)` returns `{ data }` or `{ issues }` — no exceptions
  for expected bad input. Normalization (casing) happens *inside* the validators so it
  can't be bypassed.
- **Transactions**: better-sqlite3 is synchronous — `db.transaction(() => {...})`
  wraps the spool+job mutations atomically. No async race between the two writes.
- **Staged-job pruning**: delete `staged_jobs` older than `STAGED_JOB_TTL_DAYS`
  (default 3 days) **on app startup** (replaces the old 2-hour `setInterval`).
  Backend env: `DATA_DIR`, `APP_PORT`, `STAGED_JOB_TTL_DAYS` — see
  `backend/.env.example`.
- Migrations run automatically at boot → `docker compose up` is the only deploy step.

---

## 7. Frontend Design

```
frontend/
  src/
    main.tsx            # MantineProvider + Provider(store)
    store.ts            # configureStore with the 5 RTK Query api slices
    api/
      spoolsApi.ts      # baseQuery: fetchBaseQuery('/api')
      jobsApi.ts
      projectsApi.ts
      stagedJobsApi.ts
      printersApi.ts    # printers + ams-mappings
    features/
      spools/           # SpoolList, SpoolDetail, SpoolForm, SuggestionInputs
      jobs/             # JobForm (with optional project picker), JobList (project badge), EditJobModal
      projects/         # ProjectList, ProjectDetail (totals header + reused JobList)
      staged/           # StagedJobList, CommitStagedJobFlow (spool pre-selected, optional project)
      printer/          # PrinterForm, AmsMappingEditor (channel → spool pickers)
    pages/
      Home.tsx          # spool grid: active / finished, per-spool remaining bar
      SpoolDetail.tsx   # spool info + job history
      SpoolFormPage.tsx # create/edit spool (modal on detail, page for create — keep simple: one form component, two hosts)
      Projects.tsx      # project list + detail
      StagedJobs.tsx    # list + commit flow (spool pre-selected → confirm)
      Settings.tsx      # printers (add/edit/remove) + AMS channel → spool mappings
    lib/
      format.ts         # mg→g, cents→currency, ISO→date (dayjs or Intl)
```

- **RTK Query tags**: `['Spool', 'Job', 'StagedJob', 'Project']`.
  - `createSpool` invalidates `Spool` (+ `SpoolAttributes` for the distinct lists).
  - `createJob` / `editJob` / `deleteJob` invalidate `Job` + `Spool` + `Project`
    (project totals are derived, so any job mutation refreshes them for free).
  - `commitStagedJob` invalidates `StagedJob` + `Job` + `Spool` + `Project` —
    the four-list update in one declaration.
- Staged jobs page: `pollingInterval: 15_000` (so printer-detected entries show up
  without a refresh).
- **Mantine**: `@mantine/form` for forms, `Modal` for edit dialogs, `Notifications`
  for toasts, `ColorSwatch` for spool colour display, dark mode via Mantine theme.
- Spool form inputs use `<input list>` + `<datalist>` fed by `/api/spool-attributes`
  (the old app's suggestion feature, now against canonical stored values).
- Numeric form fields coerce on submit: `Number(value)` before the mutation call.

---

## 8. Shared Code

`shared/` — plain TS, no package.json of its own; both apps import it via path alias
(`@shared` in tsconfig `paths` / Vite `resolve.alias`).

- `types.ts` — `Spool`, `Job`, `Project`, `StagedJob`, `CreateSpoolInput`, …
  (hand-written; single source of truth for both sides)
- `normalize.ts` — `normMaterial/normColour/normFinish/normBrand` (used by backend
  validators; frontend previews the normalized value in the form)
- `units.ts` — `gramsToMg`, `mgToGrams`, `centsToCurrency`
- `api.ts` — response wrapper types (`ApiError`, `PagedX` if ever needed)

---

## 9. Testing

vitest + in-memory better-sqlite3 (fresh DB per test).

**Balance invariant suite** (the core of the app's correctness):
```
spool: 750 g initial
1. create job 40 g        → used 40 g, left 710 g
2. edit job to 55 g       → used 55 g, left 695 g
3. delete job             → used 0 g,  left 750 g
4. create job 800 g       → rejected, spool untouched
5. edit job into over-draft → rejected
```

Plus: validator unit tests (missing fields, negative numbers, normalization applied),
spool edit bounds test, staged-job commit transaction test (job created + staged
deleted + spool debited in one shot), gcode-header parser tests (name + grams
extraction, missing-grams and missing-name cases — same fixtures the printer sync
uses), projects tests (totals SUM across spools, deleting a project keeps its jobs
unassigned, reassigning a job moves totals between projects), and watcher
transition tests (feed synthetic MQTT messages: `RUNNING → FINISH` fires the
completion handler exactly once, `FAILED` is surfaced, `msg==1` deltas merge into
the `msg==0` snapshot, reconnection after drop).

Frontend: no formal suite initially — `vite build` + manual pass. (Personal project;
don't build test infrastructure that won't be used.)

---

## 10. Printer Sync (Bambu LAN)

Goal: the app learns about finished prints **directly from the printer** — zero
slicer configuration. The old app's Orca post-processing script is **dropped
entirely**: printer detection is the only staged-job source (plus manual entry),
so the per-profile script config in Orca is gone for good.

### What the printer exposes (community-verified, A1 class)
- **Local MQTT** — `mqtt://<printer-ip>:8883`, TLS (self-signed v1 cert — the client
  must skip verification; fine on a trusted LAN), username `bblp`, password = the
  8-digit LAN access code (printer settings → network). **Reads work with LAN mode
  ON only** — no developer mode, no cloud.
  - Topic `device/{serial}/report`: full snapshot on `pushall`, then ~2s deltas;
    client must cache and merge (`msg == 0` = full snapshot, `msg == 1` = delta).
  - `print.gcode_state`: `IDLE | PREPARE | RUNNING | PAUSE | FINISH | FAILED | …`
    → completion detection = a `RUNNING → FINISH` transition (`FAILED` is surfaced).
  - `print.subtask_name` = job name; `mc_percent` = progress; `hms` = active errors.
  - The report has **no live "grams used" field**. The grams live in the gcode file
    the slicer uploaded — see FTPS.
- **FTPS** — `ftp://<printer-ip>:990`, implicit TLS, same `bblp` + access code.
  - `/model` → `*.gcode.3mf` (a zip: `Metadata/plate_N.gcode` +
    `Metadata/plate_N.json` carrying `bed_type` and `filament_colors`).
  - `/cache` → extracted per-plate `*_plate_N.gcode`.
  - The gcode header contains `; printing object <file>` and
    `; filament used [g] = 14.82` — the app parses these from the file on the
    printer (the same lines the old Orca script parsed, read from a better place).
  - Quirk (device-verified): the printer stamps FTPS-uploaded files with a
    non-wall-clock timestamp — **never** date a job from `MDTM`.
- **SSDP** (optional): the printer announces on multicast `239.255.255.250` with
  serial + model code (A1 = `N2S`, H2D/X2D = `O1D`). v1 = manual IP entry in
  settings; auto-discovery is a later nicety.

### Flow
1. Settings: add printer (name, IP, serial, access code).
2. Backend keeps one MQTT watcher per printer (connect, subscribe, merge
   snapshot + deltas, reconnect with backoff, dedupe by name + 24h).
3. On `gcode_state → FINISH`: fetch the job file over FTPS (match `subtask_name`),
   parse object name + grams; read AMS channel usage from the gcode's filament
   mapping.
4. Create a staged job `{ name, filamentUsedMg?, date, printerId, amsChannel? }`
   — source = printer.
5. Commit flow: spool **pre-selected** from `ams_mappings`; optional project
   picker; grams entry shown only if the parse came up empty.

---

## 11. Deployment

- **Dockerfile** (multi-stage):
  1. `deps` — install backend + frontend node_modules
  2. `build` — `vite build` (client) + `tsc` (backend → dist)
  3. `runtime` — node:22-alpine, copy backend/dist + client/dist; express serves both
- **docker-compose.yml**: one service, `APP_PORT=8080`, volume `./data:/data`
  (SQLite file + WAL live there), `restart: unless-stopped`.
- Reverse proxy (existing) maps domain → container port. No CORS, no TLS handling
  in the app.
- Backup: covered by whole-VM backup (owner's call — no app-level backup job).

---

## 12. Repository Layout

```
spool-tracker/
  DESIGN.md               # this file
  frontend/               # Vite + React + Mantine + RTK Query   (own package.json)
  backend/                # Express 5 + Drizzle + better-sqlite3 (own package.json)
  shared/                 # types + helpers, imported via @shared alias
  data/                   # gitignored; docker volume mount
  docker-compose.yml
  Dockerfile
  package.json            # root: dev scripts (concurrently), nothing else
```

(Old app's `/server` `/frontend` naming becomes `/backend` `/frontend` per owner preference.)

---

## 13. Implementation Phases

Each phase ends in something runnable/reviewable.

1. **Scaffold** — repo layout, tsconfigs, path aliases, Vite app, Express app,
   drizzle schema + first migration, `concurrently` dev flow.
2. **Spool API + tests** — validators, CRUD routes, balance-safe spool edit,
   attributes endpoint, vitest suite for spools.
3. **Spool UI** — RTK Query `spoolsApi`, list + detail + form pages with Mantine.
4. **Jobs** — job logic (transactional create/edit/delete), API, UI (form + history),
   balance invariant test suite.
5. **Projects** — `projects` table + `jobs.projectId`, API with derived totals,
   UI: projects page, project picker in job form + commit flow.
6. **Staged jobs** — endpoints, commit flow UI, startup pruning, commit
   transaction test.
7. **Printer sync** — settings + `printers`/`ams_mappings`, MQTT watcher,
   completion detection, gcode grams parse, AMS pre-select.
8. **Ship it** — Dockerfile + compose, deploy, cutover, smoke test.

---

## 14. Open Questions / Risks

| Item | Status |
|------|--------|
| `isFinished` semantics: manual flag only, or auto-set when left = 0? | Design: manual flag; auto-set as a possible nicety, not committed |
| A1 (N2S) with full AMS: exact AMS-channel field names in the MQTT report (protocol notes above are from an A1 mini + AMS Lite) | Verify against the real A1 during phase 7 before writing the mapping UI |
| H2D/X2D (O1D) protocol parity (same MQTT report shape) | Same family of community docs; confirm on arrival |
| better-sqlite3 native module in alpine runtime | Uses prebuilt binaries; if it fails, fall back to node:22-slim image |
