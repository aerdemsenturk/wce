// Barrel preserving the historical `@/lib/mediawiki` import path — the
// implementation now lives in lib/mediawiki/*, split by concern:
//   client.ts   HTTP + rate limiting + OAuth/CSRF (internal, not re-exported)
//   reads.ts    category/grid/search/file-detail read paths + cache invalidation
//   writes.ts   every edit/upload/rename/sitelink write path
//   wikidata.ts labels, item search, quick-edit statements
//   users.ts    connected-account + public user profiles/uploads/activity
export { stripCategoryPrefix, withCategoryPrefix } from "./category";
export * from "./mediawiki/reads";
export * from "./mediawiki/writes";
export * from "./mediawiki/wikidata";
export * from "./mediawiki/users";
