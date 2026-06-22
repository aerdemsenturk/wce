# WCE — Wikimedia Commons Editor

A browser-based explorer and lightweight editor for Wikimedia Commons categories and file
metadata, built for small editorial teams working with cultural heritage content.

Browse the Commons category tree, inspect file metadata, and make targeted edits
(descriptions, categories, location, depicts) — all through a fast, localized UI backed by a
read-mostly proxy over the MediaWiki and Wikidata APIs.

## Features

- **Category browser** — lazy-loaded sidebar tree with subcategory/file counts, breadcrumb
  navigation, and a Wikidata item badge for the current category.
- **File grid** — responsive card grid with thumbnail, filename, size, upload year, per-file
  status indicators (description / date / author / license / location), and a filter/sort bar.
- **File detail panel** — multilingual description (parsed from the `{{Information}}`
  template), date, author, license, clickable categories, coordinates, and Depicts (P180)
  statements.
- **Inline editing** — edit file descriptions, add/remove categories, and add/remove Depicts
  statements directly from the UI; changes are queued and published as real edits to Commons.
- **Drag-and-drop recategorization** — drag a file or subcategory onto another category to move
  it (removes the old `[[Category:...]]`, adds the new one, preserves sort keys).
- **Multi-select → merge into new category** — select multiple files/subcategories and create a
  new Commons category page from the selection in one step.
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
- **Auth:** Wikimedia OAuth 2.0 (owner-only consumer — single-account editing, no login flow)

All upstream API calls happen server-side, through `lib/mediawiki.ts` and the proxy routes
under `app/api/`, so a proper `User-Agent` is always sent and the client never talks to
Wikimedia/Wikidata/Nominatim directly.

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
```

### Environment variables

Editing features require a Wikimedia OAuth 2.0 access token tied to a single account. Create
`.env.local` (gitignored) with:

```
WIKIMEDIA_OAUTH_CLIENT_ID=...
WIKIMEDIA_OAUTH_CLIENT_SECRET=...
WIKIMEDIA_OAUTH_CALLBACK_URL=http://localhost:3000
WIKIMEDIA_OAUTH_ACCESS_TOKEN=...
```

Without `WIKIMEDIA_OAUTH_ACCESS_TOKEN`, the app still works as a read-only browser — writes are
simply disabled.

## Project structure

```
wce/
├── app/
│   ├── api/commons/{category,file,search}/route.ts   # MediaWiki proxy routes
│   ├── api/geocode/reverse/route.ts                  # Nominatim proxy
│   └── api/wikidata/search/route.ts                   # Wikidata search proxy
├── components/
│   ├── browser/      # BrowserProvider (nav state, selection, pending-changes queue)
│   ├── category/      # Sidebar tree, breadcrumb, Wikidata badge
│   ├── files/         # File/category grid, filter bar, create-category modal
│   ├── detail/         # File detail panel, description/location/depicts editing, map
│   ├── layout/         # Header, sidebar shell, language toggle
│   └── ui/             # Shared inputs, pickers, toast
├── lib/
│   ├── mediawiki.ts    # Server-side MediaWiki/Wikidata client (reads + writes)
│   ├── wikitext.ts     # {{Information}} / {{Location}} parsing + targeted patch helpers
│   ├── api.ts          # Client fetch helpers + in-memory caches
│   ├── dnd.ts           # Drag-and-drop payload helpers
│   ├── pendingChanges.ts # Local edit queue / undo-redo before publish
│   └── types.ts        # Shared domain types
├── i18n/                # next-intl config, cookie-based locale
└── messages/{tr,en}.json
```

## Status

Actively developed. Category/file browsing, metadata viewing, and a growing set of editing
operations (description, categories, location, depicts) are implemented against a real Commons
account via an owner-only OAuth consumer. There is no test suite yet — verify changes with
`npm run build` and manual checks in the browser.
