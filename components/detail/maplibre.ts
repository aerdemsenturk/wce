import * as maplibregl from "maplibre-gl";

// maplibre-gl 6 locates its web worker relative to its own module URL, which
// no longer holds once the library is bundled into a Next chunk (the worker
// request 404s). Point it at the copy the bundler emits for this reference.
maplibregl.setWorkerUrl(
  new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href,
);

export * from "maplibre-gl";
