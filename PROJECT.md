# Wikimedia Commons Editor (WCE)

A web-based interface for browsing Wikimedia Commons categories and file metadata —
built for small editorial teams working with cultural heritage content.

v1 focuses entirely on navigation and data visualization. All write operations
(editing, uploading, OAuth login) are deferred to v2, pending Wikimedia OAuth
application approval.

---

## Build status (v1)

- [x] Project scaffold — Next.js 16 (App Router, `output: standalone`), Tailwind v4, React 19
- [x] i18n — next-intl 4 **without** locale routing (cookie-based TR/EN toggle)
- [x] Layout shell — Header (logo, search, v2 badge, lang toggle), Sidebar, main area
- [x] Read-only MediaWiki client (`lib/mediawiki.ts`) + server proxy (`/api/commons/category`)
- [x] Category browser — sidebar tree (lazy subcat load + file counts), breadcrumb, Wikidata badge
- [x] File grid — cards, status dots, filter/sort bar, responsive columns (2 → up to 12)
- [x] Resizable left/right sidebars (drag handle, width persisted to localStorage)
- [x] File detail panel — multilingual descriptions, date/author/license, clickable categories, coords, Edit-on-Commons links
- [x] Location — **MapLibre GL** map (keyless OSM raster) + Nominatim reverse geocode (sessionStorage cache)
- [x] Depicts (P180) viewer — SDC `wbgetentities` on the M-id, labels resolved via Wikidata
- [x] Search — CirrusSearch `incategory:` scoped, results in the same grid

**v1 feature-complete.** `next build` passes (types + lint clean).

> Grid is container-responsive: cards stay ≥160px wide and the column count
> drops (max 6) as the main area / sidebars resize, rather than shrinking cards.
> Both sidebars are drag-resizable (width persisted; double-click resets).

> **Note on stack vs. original brief:** the brief targeted Next.js 14 + Tailwind v3,
> but the current toolchain installs Next.js 16 + Tailwind v4 + React 19 (all forward
> compatible). Tailwind v4 uses CSS-based config (no `tailwind.config.js`).
> Per `AGENTS.md`, consult `node_modules/next/dist/docs/` before using Next APIs —
> notably `params`/`cookies()`/`headers()` are now async, and middleware is `proxy`.

---

## Tech stack

- **Framework:** Next.js 16 (App Router), `output: 'standalone'`
- **Styling:** Tailwind CSS v4
- **State:** React state + localStorage/sessionStorage (no backend database)
- **APIs:** MediaWiki Action API (read-only), Commons REST API v1, Wikidata API (read-only)
- **i18n:** `next-intl` — Turkish (tr, default) and English (en), cookie-based toggle (no locale in URL)
- **Map:** MapLibre GL JS + OpenStreetMap raster tiles (no API key)
- **Deploy:** Hetzner VPS, CloudPanel Node.js app, subdomain TBD

No authentication, no server-side secrets, no `.env` needed for v1.

---

## v1 features (read-only)

1. **Category browser** — root input (saved to localStorage), lazy-loaded subcategory
   tree with file counts, breadcrumb navigation, Wikidata item badge for the current category.
2. **File grid** — responsive grid; thumbnail + filename + size + upload year; per-file
   status dots (description / date / author / license / location); filter + sort bar.
3. **File detail panel** — large thumbnail, multilingual description, date, author, license,
   categories (clickable), location, depicts; "Edit on Commons" / "Edit structured data"
   external links (v1 bridge, no in-app editing).
4. **Location** — `{{Location}}` / Wikidata coordinates → lat/lon + Nominatim place name +
   embedded Leaflet map.
5. **Depicts (P180)** — read Commons Structured Data via `wbgetentities` on the file M-id.
6. **Search** — Commons file search within the current category context.

---

## Data sources

- **MediaWiki Action API** — `https://commons.wikimedia.org/w/api.php`
  (subcats, files, wikitext, `wikibase_item` pageprop, `imageinfo`+`extmetadata`, categories).
  Called **server-side** from route handlers so we can send a proper `User-Agent`
  (Wikimedia requires it).
- **Wikidata API** — `https://www.wikidata.org/w/api.php` (`wbgetentities` for labels + depicts).
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
│   └── api/commons/
│       └── category/route.ts       # Read-only proxy: ?op=children|files
├── components/
│   ├── browser/BrowserProvider.tsx # Client context: root, path, current category
│   ├── layout/{Header,Sidebar,LanguageToggle}.tsx
│   └── category/{CategoryTree,CategoryNode,Breadcrumb,WikidataBadge}.tsx
├── i18n/
│   ├── config.ts                   # locales, defaultLocale, LOCALE_COOKIE
│   ├── request.ts                  # getRequestConfig (reads cookie)
│   └── locale.ts                   # 'use server' setLocale action
├── lib/
│   ├── mediawiki.ts                # Read-only MediaWiki client (server-side)
│   ├── category.ts                 # Pure name helpers (client+server safe)
│   ├── api.ts                      # Client fetch helpers + in-memory cache
│   └── types.ts                    # Shared domain types
├── messages/{tr,en}.json           # next-intl message catalogs
└── next.config.js                  # output: standalone + next-intl plugin
```

---

## v2 scope (pending OAuth approval)

Wikimedia OAuth 2.0 login (scopes `basic`, `editpage`, `uploadfile`); edit metadata /
categories / location / depicts via `action=edit` + Wikidata write APIs; bulk operations;
upload with EXIF pre-fill. See `OAUTH_APPLICATION.md` when ready to submit.
