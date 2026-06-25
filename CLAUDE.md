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
npm test         # vitest run — unit tests for pure lib helpers
npm run test:watch  # vitest in watch mode
```

The only automated tests are Vitest unit tests for pure functions in `lib/` (e.g.
`lib/wikitext.test.ts` covers the wikitext patch helpers). There is no integration/UI test
coverage — verify those changes via `npm run build` and manual checks in the browser.

## Project purpose and scope

WCE (Wikimedia Commons Editor) is a browser/explorer **and lightweight editor** for Wikimedia
Commons categories and file metadata, built for small editorial teams working with cultural
heritage content. See `README.md` and `PROJECT.md` for the full feature list and build status.

This is v2: editing is in scope (description, categories, depicts, location, file uploads,
drag-and-drop recategorization, category create/rename). Anonymous browsing needs no login.
Editing requires the visitor to log in with their own Wikimedia account via a real OAuth 2.0
Authorization Code + PKCE flow (`app/api/auth/{login,callback,logout}`, session encrypted in an
httpOnly cookie by `lib/session.ts`) — any Wikimedia account can edit, gated only by Commons' own
block/rights system. A separate, legacy owner-only OAuth mechanism
(`WIKIMEDIA_OAUTH_CLIENT_ID`/`_SECRET`/`_ACCESS_TOKEN`) is still wired into `lib/mediawiki.ts` as
the fallback used whenever no per-visitor token is supplied — kept temporarily pending a decision
on removal, and is what's active for a deployment that hasn't configured the per-visitor login
vars at all. Without any of these set, write endpoints return a disabled error instead of calling
Commons; the app still works as a read-only browser.

## Architecture

**Data flow:** all Wikimedia/Wikidata calls happen server-side in `lib/mediawiki.ts` — the only
module that talks to `commons.wikimedia.org` and `wikidata.org`. It sets the required
`User-Agent` and mints per-wiki CSRF tokens (a token minted on Commons can't be reused on
Wikidata, even though the OAuth bearer is shared). Every write/auth-read function takes an
optional trailing `token?: string`: route handlers resolve the logged-in visitor's access token
via `lib/session.ts` and pass it explicitly; when omitted, the function falls back to the legacy
owner-only token resolution. `lib/session.ts` has no dependency on `lib/mediawiki.ts` — it only
manages the encrypted session cookie and PKCE handshake; route handlers are the integration point
that reads a token from a session and hands it to `lib/mediawiki.ts`. Read calls revalidate every
5 minutes; write calls are not cached. `lib/mediawiki.ts` is wrapped by proxy routes under
`app/api/commons/{category,file,search,upload,user}/route.ts`, `app/api/wikidata/{search,statements}/route.ts`,
and the login flow's `app/api/auth/{login,callback,logout}/route.ts`. The client never calls
Wikimedia/Wikidata APIs directly — it goes through the fetch helpers in `lib/api.ts`, which also
maintain `BoundedCache` (LRU-evicting `Map`) caches (children, file detail, parents, preview
thumbs) so re-expanding a tree node or revisiting a category doesn't refetch within the same
session. Write helpers in `lib/api.ts` invalidate the relevant cache entries after a successful
edit.

```
Browser components → lib/api.ts (fetch + cache + write helpers) → app/api/commons/*, app/api/wikidata/*
                                                                   → lib/mediawiki.ts → Commons/Wikidata APIs
```

There's a parallel, independent path for location: `app/api/geocode/reverse` proxies Nominatim,
cached client-side in `sessionStorage` keyed by `lat,lon` (not in `lib/api.ts`'s caches).

**Batch-then-publish write model** (`lib/pendingChanges.ts`): edits made through the UI (edit
description, add/remove a category or depict, move a file/category via drag-and-drop, change or
clear location, create a category from a multi-selection) are queued locally as typed
`PendingChange` objects, not written immediately. A family of `overlay*` functions
(`overlaySubcategories`, `overlayFiles`, `overlayDescriptions`, `overlayLocation`,
`overlayCategories`, `overlayDepicts`, `overlayWikidata`) apply the queue on top of
server-fetched data so the tree/grid/detail views reflect pending edits before anything is
actually sent to Commons. `components/browser/PublishConfirmModal.tsx` /
`PublishResultsModal.tsx` drive the publish step, which replays the queue through `lib/api.ts`'s
write functions and reports per-change success/failure.

**Drag-and-drop** (`lib/dnd.ts`): a single custom MIME payload (`DragPayload`) carries the
dragged page title, its current category, and (for multi-selection drags) the full snapshotted
batch — used by `FileCard`, `CategoryCard`, and `CategoryNode` as both drag source and drop
target. A multi-selection drag swaps in a small "count" pill as the drag image instead of the
default single-card ghost.

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
(`prop=coordinates`) take priority over wikitext `{{Location}}` when both exist. Edits to
description/location/categories go through targeted wikitext patch helpers in `lib/wikitext.ts`
rather than rewriting the whole page, to minimize diff noise on Commons.

`lib/category.ts` holds pure category-name helpers (prefix add/strip, Commons URL building, the
app's `/wiki/Category:Name`-style route path ↔ category-name conversion) shared by client and
server code — no API calls.

**State/navigation:** `components/browser/BrowserProvider.tsx` is a client context holding the
root category (persisted to `localStorage`), the current navigation path, the selected
category/files, the pending-change queue, recent/favorite categories, and toast state — most of
`components/category/*`, `components/files/*`, and `components/detail/*` read from it instead of
prop-drilling.

**i18n:** `next-intl`, but **without locale routing** — there's no `[locale]` segment. Locale is
chosen by a cookie (`NEXT_LOCALE`, see `i18n/config.ts`) and read server-side in
`i18n/request.ts`; switching is a `'use server'` action in `i18n/locale.ts`. Default locale is
Turkish (`tr`); message catalogs are `messages/{tr,en}.json`. The chosen `lang` is also threaded
through to the MediaWiki calls themselves (`iiextmetadatalanguage`, Wikidata `languages` param) so
descriptions/labels come back pre-localized, not just the UI chrome.

**Map:** MapLibre GL with keyless OSM raster tiles (no Leaflet despite what `PROJECT.md` says in
one place) — `components/detail/LocationMap.tsx` (display) and `LocationPickerMap.tsx` (editing
coordinates).

## Environment variables

Read-only browsing works with no environment configuration at all. Two independent write
mechanisms, in `.env.local` (gitignored):

```
# Per-visitor login (preferred) — any Wikimedia account can log in and edit as itself.
WIKIMEDIA_OAUTH_LOGIN_CLIENT_ID=...
WIKIMEDIA_OAUTH_LOGIN_CLIENT_SECRET=...
WIKIMEDIA_OAUTH_LOGIN_CALLBACK_URL=https://<domain>/api/auth/callback
SESSION_SECRET=...           # encrypts the session cookie; required once the above are set

# Legacy owner-only fallback — used whenever no per-visitor session exists.
WIKIMEDIA_OAUTH_CLIENT_ID=...
WIKIMEDIA_OAUTH_CLIENT_SECRET=...
WIKIMEDIA_OAUTH_ACCESS_TOKEN=...
```
