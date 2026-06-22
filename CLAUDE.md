# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## This is NOT the Next.js you know

The installed toolchain is Next.js 16 (App Router) + React 19 + Tailwind v4 — newer than this
model's training data, with breaking API changes (e.g. `params`/`cookies()`/`headers()` are
async, middleware is named `proxy`). **Before writing code that touches Next.js APIs, read the
relevant guide in `node_modules/next/dist/docs/`.** Tailwind v4 uses CSS-based config — there is
no `tailwind.config.js`; theme tokens live in `app/globals.css`.

## Commands

```bash
npm run dev      # dev server (localhost:3000)
npm run build    # production build — also the closest thing to a typecheck (must pass: types + lint clean)
npm run start    # run the production build
npm run lint     # eslint
```

There is no test suite yet. Verify changes via `npm run build` and manual checks in the browser.

## Project purpose and scope

WCE (Wikimedia Commons Editor) is a read-only browser/explorer for Wikimedia Commons categories
and file metadata, built for small editorial teams working with cultural heritage content.

**v1 is read-only by design** — no auth, no server-side secrets, no `.env`, no write operations.
Editing, uploading, and OAuth login are deferred to v2 pending Wikimedia OAuth approval. Do not
add write/edit/upload functionality unless explicitly asked — it's out of scope until OAuth lands.
See `PROJECT.md` for the full feature/build-status checklist.

## Architecture

**Data flow:** all Wikimedia API calls happen server-side. `lib/mediawiki.ts` is the only module
that talks to `commons.wikimedia.org` and `wikidata.org` — it sets a required `User-Agent` and
revalidates upstream responses every 5 minutes. It's wrapped by the read-only proxy routes in
`app/api/commons/{category,file,search}/route.ts`. The client never calls Wikimedia APIs directly;
it calls these routes via the fetch helpers in `lib/api.ts`, which also maintain in-memory
`Map`-based caches (`childrenCache`, `fileDetailCache`, `gridCache`) so re-expanding a tree node or
revisiting a category doesn't refetch within the same session.

```
Browser components → lib/api.ts (fetch + cache) → /api/commons/* route handlers
                                                  → lib/mediawiki.ts → Commons/Wikidata APIs
```

There's a parallel, independent path for location: `app/api/geocode/reverse` proxies Nominatim,
cached client-side in `sessionStorage` keyed by `lat,lon` (not in `lib/api.ts`'s in-memory cache).

**Category/file domain model** lives in `lib/types.ts`. Two shapes matter most:
- `CategoryChildren` — subcategories + file count + Wikidata badge for one category (sidebar tree).
- `CategoryFileInfo` — one grid card's worth of data, including the derived `FileStatus` (which of
  description/date/author/license/location are present) and `missingCount`, used by the grid's
  filter/sort bar. `FileStatus` is derived in `lib/mediawiki.ts`'s `deriveStatus()` from
  `imageinfo.extmetadata`, not from wikitext.

For the file detail panel, `getFileDetail()` in `lib/mediawiki.ts` prefers wikitext-parsed fields
(via `lib/wikitext.ts`'s `parseInformation()`, which reads the `{{Information}}` template for
multilingual descriptions/date/author and `{{Location}}` for coordinates) and falls back to
`imageinfo.extmetadata` only when wikitext parsing comes up empty. GeoData coordinates
(`prop=coordinates`) take priority over wikitext `{{Location}}` when both exist.

**State/navigation:** `components/browser/BrowserProvider.tsx` is a client context holding the
root category (persisted to `localStorage`), the current navigation path, and the selected
category — most of `components/category/*` and `components/files/*` read from it instead of
prop-drilling.

**i18n:** `next-intl`, but **without locale routing** — there's no `[locale]` segment. Locale is
chosen by a cookie (`NEXT_LOCALE`, see `i18n/config.ts`) and read server-side in
`i18n/request.ts`; switching is a `'use server'` action in `i18n/locale.ts`. Default locale is
Turkish (`tr`); message catalogs are `messages/{tr,en}.json`. The chosen `lang` is also threaded
through to the MediaWiki calls themselves (`iiextmetadatalanguage`, Wikidata `languages` param) so
descriptions/labels come back pre-localized, not just the UI chrome.

**Map:** MapLibre GL with keyless OSM raster tiles (no API key, no Leaflet despite what `PROJECT.md`
says in one place — check `components/detail/LocationMap.tsx` if unsure).
