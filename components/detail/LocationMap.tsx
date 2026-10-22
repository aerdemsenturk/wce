"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import * as maplibregl from "./maplibre";
import type { StyleSpecification } from "maplibre-gl";
import { useEffect, useRef } from "react";

// Keyless raster style backed by the OpenStreetMap standard tiles.
const OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

export default function LocationMap({
  lat,
  lon,
}: {
  lat: number;
  lon: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = new maplibregl.Map({
      container,
      style: OSM_STYLE,
      center: [lon, lat],
      zoom: 12,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    new maplibregl.Marker({ color: "#0f172a" }).setLngLat([lon, lat]).addTo(map);

    // Keep the map sized to its container as the detail panel is resized.
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container);

    return () => {
      observer.disconnect();
      map.remove();
    };
  }, [lat, lon]);

  return (
    <div
      ref={containerRef}
      className="h-44 w-full overflow-hidden rounded-md border border-border-base"
    />
  );
}
