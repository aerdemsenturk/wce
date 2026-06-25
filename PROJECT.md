# Wikimedia Commons Editor (WCE)

A web-based browser **and lightweight editor** for Wikimedia Commons categories and file
metadata — built for small editorial teams working with cultural heritage content.

v1 was navigation/visualization only. **This is v2:** editing is in scope (descriptions,
categories, depicts, location, uploads, drag-and-drop recategorization, category create/rename).
Anonymous browsing needs no login; editing requires the visitor to log in with their own
Wikimedia account (real OAuth 2.0 Authorization Code + PKCE flow). A legacy owner-only OAuth
consumer remains as a fallback for deployments that haven't configured per-visitor login.
Without either configured, the app still works as a read-only browser; write endpoints return a
disabled error instead of calling Commons.

---

## Build status

- [x] Project scaffold — Next.js 16 (App Router, `output: standalone`), Tailwind v4, React 19
- [x] i18n — next-intl 4 **without** locale routing (cookie-based TR/EN toggle)
- [x] Layout shell — Header (logo, search, lang toggle, user menu), Sidebar, main area
- [x] MediaWiki client (`lib/mediawiki.ts`) + server proxy routes (reads **and** writes)
- [x] Category browser — sidebar tree (lazy subcat load + file counts), breadcrumb, Wikidata badge
- [x] Category header — Wikidata description, rename, sitelink edit/clear, create-subcategory
- [x] Recent + favorite categories (localStorage-backed shortcuts)
- [x] File grid — cards, status dots, filter/sort bar, responsive columns, cover/preview thumbs
- [x] Resizable left/right sidebars (drag handle, width persisted to localStorage)
- [x] File detail panel — multilingual descriptions, date/author/license, clickable categories, coords
- [x] Location — MapLibre GL map (keyless OSM raster) + Nominatim reverse geocode (sessionStorage cache)
- [x] Depicts (P180) viewer — SDC `wbgetentities` on the M-id, labels resolved via Wikidata
- [x] Search — CirrusSearch `incategory:` scoped, results in the same grid
- [x] **Editing** — description, add/remove category, add/remove depict, location set/clear
- [x] **Drag-and-drop recategorization** — files and subcategories, sort keys preserved
- [x] **Multi-select** — bulk category edit + create-category-from-selection
- [x] **Category create / rename** — keeps the linked Wikidata sitelink in sync
- [x] **Uploads** — new files to Commons with EXIF-prefilled metadata
- [x] **Deletion nomination** — nominate a file for deletion from the detail panel
- [x] **Batch-then-publish** — local pending-change queue, overlay preview, per-change publish results
- [x] **Activity feed** — recent edits/uploads view
- [x] **Per-visitor login** — OAuth 2.0 Authorization Code + PKCE (`app/api/auth/*`,
  `lib/session.ts`); pending live verification once the new OAuth consumer is approved

> Grid is container-responsive: cards stay ≥160px wide and the column count drops as the main
> area / sidebars resize, rather than shrinking cards. Both sidebars are drag-resizable (width
> persisted; double-click resets).

> **Note on stack vs. original brief:** the brief targeted Next.js 14 + Tailwind v3, but the
> current toolchain installs Next.js 16 + Tailwind v4 + React 19. Tailwind v4 uses CSS-based
> config (no `tailwind.config.js`). Per `AGENTS.md`, consult `node_modules/next/dist/docs/`
> before using Next APIs — notably `params`/`cookies()`/`headers()` are now async, and middleware
> is `proxy`.

---

## Tech stack

- **Framework:** Next.js 16 (App Router), `output: 'standalone'`
- **Styling:** Tailwind CSS v4 (CSS-based theme config, no `tailwind.config.js`)
- **State:** React context + localStorage/sessionStorage (no backend database)
- **APIs:** MediaWiki Action API (read + write), Commons upload, Wikidata API (read + write for sitelinks/depicts)
- **i18n:** `next-intl` — Turkish (tr, default) and English (en), cookie-based toggle (no locale in URL)
- **Map:** MapLibre GL JS + OpenStreetMap raster tiles (no API key)
- **EXIF:** `exifr` for upload metadata pre-fill
- **Auth:** Wikimedia OAuth 2.0 — per-visitor Authorization Code + PKCE login (any Wikimedia
  account, session encrypted in an httpOnly cookie); a legacy owner-only consumer remains as a
  fallback pending a removal decision
- **Deploy:** Hetzner VPS, CloudPanel Node.js app, `wce.birtakimseyler.com`

Read-only browsing needs no environment config. Editing needs either the per-visitor login env
vars or the legacy owner-only ones — see `README.md`.

---

## Edit model

All edits flow through a **batch-then-publish** queue (`lib/pendingChanges.ts`) rather than being
written immediately. The UI queues typed `PendingChange` objects and applies them as overlays on
top of server-fetched data, so the tree/grid/detail views reflect pending edits before publish.
The current change types are:

`description`, `move` (file/category), `createCategory`, `removeCategory`, `rename`,
`addCategory`, `addDepict`, `removeDepict`, `location`, `removeLocation`, `nominateDeletion`.

Publishing (`components/browser/PublishConfirmModal.tsx` → `PublishResultsModal.tsx`) replays the
queue through `lib/api.ts`'s write helpers and reports per-change success/failure.

---

## Data sources

- **MediaWiki Action API** — `https://commons.wikimedia.org/w/api.php`
  (subcats, files, wikitext, `wikibase_item` pageprop, `imageinfo`+`extmetadata`, categories,
  `action=edit`, uploads, SDC). Called **server-side** from route handlers so a proper
  `User-Agent` is always sent and the OAuth bearer/CSRF tokens stay off the client.
- **Wikidata API** — `https://www.wikidata.org/w/api.php` (`wbgetentities` for labels + depicts,
  sitelink read/write for category ↔ Wikidata linkage).
- **Nominatim** — `https://nominatim.openstreetmap.org/reverse` (reverse geocode,
  cached in sessionStorage keyed by `lat,lon`).

---

## Project structure (current)

```
wce/
├── app/
│   ├── layout.tsx                  # Root layout, NextIntlClientProvider, <html lang>
│   ├── page.tsx                    # Home — BrowserProvider + Header + Sidebar + main
│   ├── globals.css                 # Tailwind v4 + theme tokens
│   └── api/
│       ├── auth/{login,callback,logout}/route.ts                # Per-visitor OAuth login flow
│       ├── commons/{category,file,search,upload,user}/route.ts  # MediaWiki proxy (read + write)
│       ├── geocode/reverse/route.ts                             # Nominatim proxy
│       └── wikidata/{search,statements}/route.ts                # Wikidata proxy routes
├── components/
│   ├── browser/      # BrowserProvider (nav state, selection, pending-changes queue), publish modals
│   ├── category/      # Sidebar tree, breadcrumb, Wikidata badge, header, recents/favorites
│   ├── files/         # Grid, filter bar, selection toolbar, bulk-edit & create-category modals
│   ├── detail/         # Detail panel, description/location/depicts editing, deletion nomination, map
│   ├── upload/         # Upload modal, drop zone, EXIF-driven preview
│   ├── activity/       # Activity feed and uploads view
│   ├── layout/         # Header, sidebar shell, language toggle, user menu
│   └── ui/             # Shared inputs, pickers, toast
├── i18n/
│   ├── config.ts                   # locales, defaultLocale, LOCALE_COOKIE
│   ├── request.ts                  # getRequestConfig (reads cookie)
│   └── locale.ts                   # 'use server' setLocale action
├── lib/
│   ├── mediawiki.ts                # Server-side MediaWiki/Wikidata client (reads + writes)
│   ├── session.ts                  # Encrypted per-visitor login session + PKCE handshake
│   ├── wikitext.ts                 # {{Information}} / {{Location}} parsing + targeted patch helpers
│   ├── api.ts                      # Client fetch helpers + in-memory caches + write helpers
│   ├── pendingChanges.ts           # Local edit queue + overlay helpers before publish
│   ├── dnd.ts                      # Drag-and-drop payload helpers
│   ├── exif.ts                     # EXIF extraction for upload metadata pre-fill
│   ├── activity.ts                 # Recent edits/uploads activity log
│   ├── recentCategories.ts / favoriteCategories.ts  # localStorage category shortcuts
│   ├── nominatim.ts / format.ts / category.ts        # geocode, formatting, name helpers
│   └── types.ts                    # Shared domain types
├── messages/{tr,en}.json           # next-intl message catalogs
└── next.config.js                  # output: standalone + next-intl plugin
```

---

## Possible next steps

- **Tests** — Vitest covers `lib/wikitext.ts`'s patch helpers; the pending-change overlay logic
  (`lib/pendingChanges.ts`) is the next highest-value, lowest-risk candidate for unit tests.
- **Remaining `{{Information}}` fields** — author/date/license are read-only; only description is
  editable. These are the status dots that can't yet be cleared from the UI.
- **Publish robustness** — done: a retried rename/create-category change no longer fails forever
  on the steps it already completed (category move/create, per-file recategorization are now
  idempotent in `lib/mediawiki.ts`). Still open: no explicit "retry failed only" action in
  `PublishResultsModal` — the user has to close it and hit Publish again.
- **Editorial speed** — keyboard shortcuts for grid navigation and quick category assignment.
- **Per-visitor login cleanup** — once the new OAuth consumer is approved and the flow is proven
  in production, decide whether to remove the legacy owner-only mechanism
  (`WIKIMEDIA_OAUTH_CLIENT_ID`/`_SECRET`/`_ACCESS_TOKEN` in `lib/mediawiki.ts`) or keep it as a
  permanent fallback.
