# WCE — Wikimedia Commons Editor

A browser-based explorer and lightweight editor for Wikimedia Commons categories and file
metadata, built for small editorial teams working with cultural heritage content.

Browse the Commons category tree, inspect file metadata, and make targeted edits
(descriptions, categories, location, depicts) — all through a fast, localized UI backed by a
read-mostly proxy over the MediaWiki and Wikidata APIs.

## Features

- **Category browser** — lazy-loaded sidebar tree with subcategory/file counts, breadcrumb
  navigation, a Wikidata item badge for the current category, plus recent and favorite category
  shortcuts.
- **Category header** — current category's Wikidata description, with actions to rename the
  category, edit/clear its Wikidata sitelink, and create a subcategory.
- **File grid** — responsive card grid with thumbnail, filename, size, upload year, per-file
  status indicators (description / date / author / license / location), and a filter/sort bar.
- **File detail panel** — multilingual description (parsed from the `{{Information}}`
  template), date, author, license, clickable categories, coordinates, and Depicts (P180)
  statements.
- **Inline editing** — edit file descriptions, add/remove categories, and add/remove Depicts
  statements directly from the UI; changes are queued and published as real edits to Commons.
- **Drag-and-drop recategorization** — drag a file or subcategory onto another category to move
  it (removes the old `[[Category:...]]`, adds the new one, preserves sort keys).
- **Multi-select bulk actions** — select multiple files/subcategories to bulk-edit categories or
  create a new Commons category page from the selection in one step.
- **Category create / rename** — create categories from a selection and rename existing
  categories, keeping the linked Wikidata sitelink in sync.
- **Uploads** — upload new files to Commons with metadata pre-filled from EXIF (date, location).
- **Deletion nomination** — nominate a file for deletion from the detail panel.
- **Batch-then-publish** — all edits are queued locally as typed pending changes and previewed in
  the tree/grid/detail views, then published together with per-change success/failure reporting.
- **Activity feed** — review your recent edits and uploads in a dedicated activity view.
- **Location** — reads `{{Location}}` wikitext and Wikidata coordinates, shows them on a
  keyless MapLibre GL / OpenStreetMap map, with reverse geocoding via Nominatim. Coordinates are
  editable from the same panel.
- **Search** — Commons file search scoped to the current category (CirrusSearch
  `incategory:`).
- **i18n** — Turkish (default) and English, switched via a cookie — no locale segment in the
  URL.

## Tech stack

- **Framework:** Next.js 16 (App Router), React 19
- **Styling:** Tailwind CSS v4 (CSS-based theme config, no `tailwind.config.js`)
- **Map:** MapLibre GL JS + OpenStreetMap raster tiles (no API key required)
- **i18n:** `next-intl` (cookie-based locale, no locale routing)
- **Data sources:** MediaWiki Action API (`commons.wikimedia.org`), Wikidata API
  (`www.wikidata.org`), Nominatim (reverse geocoding)
- **Auth:** Wikimedia OAuth 2.0 — per-visitor Authorization Code + PKCE login for editing (any
  Wikimedia account, session in an encrypted httpOnly cookie); a legacy owner-only client
  remains wired in `lib/mediawiki/` as a fallback for deployments that haven't configured
  per-visitor login

All upstream API calls happen server-side, through the `lib/mediawiki/` modules and the proxy
routes under `app/api/`, so a proper `User-Agent` is always sent and the client never talks to
Wikimedia/Wikidata/Nominatim directly. Hot category reads are served from a short-TTL server
cache that write operations invalidate, so published edits are visible immediately without
refetching everything on every navigation.

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
```

Other scripts:

```bash
npm run build    # production build — also the project's typecheck (types + lint must be clean)
npm run start     # run the production build
npm run lint      # eslint
npm test          # vitest run — unit tests for pure lib helpers
```

### Environment variables

Read-only browsing needs no environment configuration. Editing needs one of two mechanisms,
configured in `.env.local` (gitignored):

**Per-visitor login (preferred)** — any Wikimedia account can log in and edit as itself:

```
WIKIMEDIA_OAUTH_LOGIN_CLIENT_ID=...
WIKIMEDIA_OAUTH_LOGIN_CLIENT_SECRET=...
WIKIMEDIA_OAUTH_LOGIN_CALLBACK_URL=https://<your-domain>/api/auth/callback
SESSION_SECRET=...
```

Register a normal (not owner-only) OAuth 2.0 consumer at
`Special:OAuthConsumerRegistration/propose` on `meta.wikimedia.org` — confidential client,
callback URL exactly matching `WIKIMEDIA_OAUTH_LOGIN_CALLBACK_URL`, applicable to all Wikimedia
wikis, with the same edit/upload/move grants the legacy consumer below has.

**Legacy owner-only fallback** — single pre-approved account, used whenever no visitor is
logged in:

```
WIKIMEDIA_OAUTH_CLIENT_ID=...
WIKIMEDIA_OAUTH_CLIENT_SECRET=...
WIKIMEDIA_OAUTH_ACCESS_TOKEN=...
```

Without any of the above, the app still works as a read-only browser — writes are simply
disabled.

## Project structure

```
wce/
├── app/
│   ├── api/auth/{login,callback,logout}/route.ts     # Per-visitor OAuth login flow
│   ├── api/commons/{category,file,search,upload,user}/route.ts  # MediaWiki proxy routes
│   ├── api/geocode/reverse/route.ts                  # Nominatim proxy
│   └── api/wikidata/{search,statements}/route.ts      # Wikidata proxy routes
├── components/
│   ├── browser/      # BrowserProvider (nav state, selection, pending-changes queue), publish modals
│   ├── category/      # Sidebar tree, breadcrumb, Wikidata badge, header, recents/favorites
│   ├── files/         # File/category grid, filter bar, selection toolbar, bulk-edit & create-category modals
│   ├── detail/         # File detail panel, description/location/depicts editing, deletion nomination, map
│   ├── upload/         # Upload modal, drop zone, EXIF-driven preview
│   ├── activity/       # Activity feed and uploads view
│   ├── layout/         # Header, sidebar shell, language toggle, user menu
│   └── ui/             # Shared inputs, pickers, toast
├── lib/
│   ├── mediawiki.ts    # Barrel over lib/mediawiki/ (import path stays @/lib/mediawiki)
│   ├── mediawiki/      # Server-side MediaWiki/Wikidata client, split by concern:
│   │                   #   client (HTTP/OAuth/rate limit), reads, writes, wikidata, users
│   ├── serverCache.ts  # TTL+LRU cache for upstream category reads, invalidated on writes
│   ├── session.ts      # Encrypted per-visitor login session + PKCE handshake
│   ├── wikitext.ts     # {{Information}} / {{Location}} parsing + targeted patch helpers
│   ├── api.ts          # Client fetch helpers + in-memory caches
│   ├── dnd.ts           # Drag-and-drop payload helpers
│   ├── pendingChanges.ts # Local edit queue / overlay helpers before publish
│   ├── exif.ts          # EXIF extraction for upload metadata pre-fill
│   ├── activity.ts      # Recent edits/uploads activity log
│   ├── recentCategories.ts / favoriteCategories.ts  # localStorage-backed category shortcuts
│   ├── nominatim.ts / format.ts / category.ts        # geocode, formatting, name helpers
│   └── types.ts        # Shared domain types
├── i18n/                # next-intl config, cookie-based locale
└── messages/{tr,en}.json
```

## Deployment

Pushing to `main` deploys to production via GitHub Actions
(`.github/workflows/deploy.yml`), in two gated steps:

1. **verify** — `npm ci`, the test suite and a full production build run on a GitHub runner.
   The build uses `output: "standalone"`; together with `public/`, `.next/static` and
   `ecosystem.config.cjs` it is packaged as `release.tgz`. If anything fails, the deploy step
   never starts and the server is untouched.
2. **deploy** — uploads `release.tgz`, unpacks it into
   `~/htdocs/wce.birtakimseyler.com/releases/<commit-sha>/`, symlinks the server's
   `.env.local` into it and re-registers the `wce` pm2 process from that release's
   `ecosystem.config.cjs`. The three newest releases are kept.

The server never runs `npm ci` or `next build`: it's a small host shared with other apps, and
building there starves it of memory. Secrets live only in the server's
`~/htdocs/wce.birtakimseyler.com/.env.local`. To roll back, on the server:
`pm2 delete wce && pm2 start releases/<older-sha>/ecosystem.config.cjs && pm2 save`.

Deploys are serialized (`concurrency: production-deploy`): overlapping pushes queue behind the
running deploy instead of racing it on the server.

## Status

Actively developed. Category/file browsing, metadata viewing, and a growing set of editing
operations (description, categories, location, depicts) are implemented against real Commons
accounts. Per-visitor Wikimedia login is implemented; live end-to-end verification is pending
approval of the new OAuth consumer. Vitest covers the pure helpers in `lib/` (e.g.
`lib/wikitext.ts`, `lib/session.ts`); there is no integration/UI test coverage — verify those
changes with `npm run build` and manual checks in the browser.
