import { NextResponse } from "next/server";
import { MAX_DOCUMENT_BYTES } from "@/lib/documents";
import { extractDocument } from "@/lib/server/document-extract";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow" };
export async function POST(req: Request) {
  const type = req.headers.get("content-type") || "";
  if (!type.includes("multipart/form-data"))
    return NextResponse.json({ error: "Expected multipart file upload" }, { status: 415, headers });
  const length = Number(req.headers.get("content-length") || 0);
  if (length > MAX_DOCUMENT_BYTES + 65536)
    return NextResponse.json({ error: "File too large" }, { status: 413, headers });
  try {
    const form = await req.formData();
    const value = form.get("file");
    if (!(value instanceof File))
      return NextResponse.json({ error: "Select a file" }, { status: 400, headers });
    if (value.size < 1 || value.size > MAX_DOCUMENT_BYTES)
      return NextResponse.json({ error: "File must be under 8 MB" }, { status: 413, headers });
    const attachment = await extractDocument(value.name, new Uint8Array(await value.arrayBuffer()));
    return NextResponse.json({ document: attachment }, { headers });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Document could not be read";
    return NextResponse.json({ error: message }, { status: 422, headers });
  }
}
