"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import * as maplibregl from "maplibre-gl";
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

const DEFAULT_CENTER: [number, number] = [35, 39];
const DEFAULT_ZOOM = 5;
const PICK_ZOOM = 12;

/** Click- (or drag-) to-pick map for the location modal. Reports picks via
 * `onPick`, and re-centers/moves its marker when `value` changes from
 * outside (e.g. the user typing coordinates into the text field). */
export default function LocationPickerMap({
  value,
  onPick,
}: {
  value: { lat: number; lon: number } | null;
  onPick: (lat: number, lon: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onPickRef = useRef(onPick);

  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = new maplibregl.Map({
      container,
      style: OSM_STYLE,
      center: value ? [value.lon, value.lat] : DEFAULT_CENTER,
      zoom: value ? PICK_ZOOM : DEFAULT_ZOOM,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    const marker = new maplibregl.Marker({ color: "#0f172a", draggable: true });
    if (value) marker.setLngLat([value.lon, value.lat]).addTo(map);

    marker.on("dragend", () => {
      const { lat, lng } = marker.getLngLat();
      onPickRef.current(lat, lng);
    });

    map.on("click", (e) => {
      const { lat, lng } = e.lngLat;
      marker.setLngLat([lng, lat]).addTo(map);
      onPickRef.current(lat, lng);
    });

    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container);

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Map is created once; later coordinate changes are synced below instead
    // of recreating the map (which would discard pan/zoom state).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker || !value) return;

    // Skip if this update originated from the map itself (click/drag).
    const current = marker.getLngLat();
    const same =
      Math.abs(current.lat - value.lat) < 1e-9 && Math.abs(current.lng - value.lon) < 1e-9;
    if (same) return;

    marker.setLngLat([value.lon, value.lat]).addTo(map);
    map.flyTo({ center: [value.lon, value.lat], zoom: Math.max(map.getZoom(), PICK_ZOOM) });
  }, [value]);

  return (
    <div
      ref={containerRef}
      className="h-56 w-full overflow-hidden rounded-md border border-border-base"
    />
  );
}
