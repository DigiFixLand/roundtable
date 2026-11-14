import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import {
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_CHARS,
  MAX_DOCUMENT_NAME,
  MAX_DOCUMENT_PAGES,
  type AttachedDocument,
  type DocumentFormat,
  type DocumentPage,
} from "@/lib/documents";

function splitSections(text: string): DocumentPage[] {
  const pages: DocumentPage[] = [];
  let rest = text.trim();
  while (rest.length) {
    let end = Math.min(rest.length, 6_000);
    if (end < rest.length) {
      const split = rest.lastIndexOf("\n", end);
      if (split > end / 2) end = split + 1;
    }
    const chunk = rest.slice(0, end).trim();
    if (chunk) pages.push({ page: pages.length + 1, text: chunk });
    rest = rest.slice(end).trimStart();
    if (pages.length > MAX_DOCUMENT_PAGES) throw Error("Too many document sections");
  }
  return pages;
}
export function safeName(raw: string): string {
  return raw
    .replace(/[\\/\x00-\x1f\x7f]/g, "")
    .trim()
    .slice(0, MAX_DOCUMENT_NAME);
}
export async function extractDocument(
  nameInput: string,
  data: Uint8Array,
): Promise<AttachedDocument> {
  const name = safeName(nameInput);
  const match = name.match(/\.([a-z0-9]+)$/i);
  const format = match?.[1]?.toLowerCase() as DocumentFormat | undefined;
  if (!format || !["pdf", "docx", "txt", "md"].includes(format))
    throw Error("Use a PDF, DOCX, TXT or MD file");
  // pdf.js may transfer/detach the input Uint8Array while parsing, making its
  // length 0 afterwards. Capture the upload size before giving it to PDFParse.
  const sizeBytes = data.byteLength;
  if (!sizeBytes || sizeBytes > MAX_DOCUMENT_BYTES)
    throw Error("File is empty or larger than 8 MB");
  let pages: DocumentPage[] = [];
  if (format === "pdf") {
    if (new TextDecoder("ascii").decode(data.subarray(0, 5)) !== "%PDF-")
      throw Error("Invalid PDF file");
    // Next.js bundles the parser in a route chunk; point its fake worker to the
    // installed package instead of looking beside .next/server/.../route.js.
    PDFParse.setWorker(
      pathToFileURL(
        join(process.cwd(), "node_modules", "pdf-parse", "dist", "worker", "pdf.worker.mjs"),
      ).href,
    );
    const parser = new PDFParse({ data });
    try {
      const meta = await parser.getInfo();
      const total = meta.total;
      if (!Number.isInteger(total) || total < 1 || total > MAX_DOCUMENT_PAGES)
        throw Error("PDF has too many pages (maximum 75)");
      let runningChars = 0;
      for (let n = 1; n <= total; n++) {
        const extracted = await parser.getText({ partial: [n] });
        const text = (extracted.text || "").trim();
        if (!text) throw Error(`Page ${n} has no extractable text. OCR is not enabled.`);
        if (text.length > 20_000) throw Error(`Page ${n} has too much text`);
        runningChars += text.length;
        if (runningChars > MAX_DOCUMENT_CHARS)
          throw Error("Extracted text exceeds 120,000 characters");
        pages.push({ page: n, text });
      }
    } finally {
      await parser.destroy();
    }
  } else if (format === "docx") {
    if (data[0] !== 0x50 || data[1] !== 0x4b) throw Error("Invalid DOCX file");
    const result = await mammoth.extractRawText({ buffer: Buffer.from(data) });
    pages = splitSections(result.value);
  } else {
    if (data.includes(0)) throw Error("Binary data is not a text document");
    const text = new TextDecoder("utf-8", { fatal: true }).decode(data).replace(/^\uFEFF/, "");
    pages = splitSections(text);
  }
  if (!pages.length)
    throw Error(
      "No extractable text. Image-only scanned documents need OCR, which is not enabled.",
    );
  const charCount = pages.reduce((n, p) => n + p.text.length, 0);
  if (charCount > MAX_DOCUMENT_CHARS) throw Error("Extracted text exceeds 120,000 characters");
  if (pages.some((p) => p.text.length > 20_000)) throw Error("Document contains an oversized page");
  return { id: randomUUID(), name, format, sizeBytes, pages, charCount };
}
