import { NextResponse, type NextRequest } from "next/server";
import { uploadFile, type UploadMeta } from "@/lib/mediawiki";

// v2 write path: upload one new file to Commons. Multipart form-data with a
// `file` blob plus the metadata fields used to build the description page.
// POST /api/commons/upload
export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form data" },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing 'file'" }, { status: 400 });
  }

  const lat = Number.parseFloat(String(form.get("lat") ?? ""));
  const lon = Number.parseFloat(String(form.get("lon") ?? ""));

  const meta: UploadMeta = {
    filename: String(form.get("filename") ?? "").trim(),
    description: String(form.get("description") ?? ""),
    descriptionLang: String(form.get("descriptionLang") ?? "en"),
    date: String(form.get("date") ?? ""),
    author: String(form.get("author") ?? ""),
    source: String(form.get("source") ?? ""),
    license: String(form.get("license") ?? ""),
    categories: form.getAll("categories").map(String),
    location:
      Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null,
  };

  if (!meta.filename) {
    return NextResponse.json({ error: "Missing 'filename'" }, { status: 400 });
  }

  try {
    const result = await uploadFile(file, meta);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upstream error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
