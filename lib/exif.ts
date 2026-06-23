import exifr from "exifr";
import type { Coordinates } from "./types";

export interface ExifData {
  date: string | null;
  location: Coordinates | null;
}

/**
 * Best-effort EXIF read for a freshly dropped/selected photo: date taken and
 * GPS coordinates, if either is embedded. Never throws — most files have
 * neither, or aren't JPEGs with EXIF at all.
 */
export async function readImageExif(file: File): Promise<ExifData> {
  const [tags, gps] = await Promise.all([
    exifr.parse(file, { pick: ["DateTimeOriginal", "CreateDate"] }).catch(() => null),
    exifr.gps(file).catch(() => null),
  ]);

  const taken: unknown = tags?.DateTimeOriginal ?? tags?.CreateDate;
  const date =
    taken instanceof Date && !Number.isNaN(taken.getTime())
      ? taken.toISOString().slice(0, 10)
      : null;

  const location =
    gps && typeof gps.latitude === "number" && typeof gps.longitude === "number"
      ? { lat: gps.latitude, lon: gps.longitude }
      : null;

  return { date, location };
}
