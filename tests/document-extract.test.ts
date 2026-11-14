import { describe, expect, it, vi } from "vitest";
import { validateDocuments } from "@/lib/documents";

// pdf.js can transfer the original ArrayBuffer to a worker. In that case
// Uint8Array.byteLength becomes zero even though the upload was nonempty.
vi.mock("pdf-parse", () => ({
  PDFParse: class {
    static setWorker() {}
    constructor(options: { data: Uint8Array }) {
      structuredClone(options.data.buffer, { transfer: [options.data.buffer] });
    }
    async getInfo() {
      return { total: 1 };
    }
    async getText() {
      return { text: "Sample report page text." };
    }
    async destroy() {}
  },
}));
import { extractDocument } from "@/lib/server/document-extract";

describe("PDF extraction metadata", () => {
  it("preserves the original file byte count after pdf.js transfers its buffer", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.4\nsynthetic content");
    const uploadedSize = bytes.byteLength;
    const extracted = await extractDocument("Sample.pdf", bytes);
    expect(bytes.byteLength).toBe(0); // proof that the PDF worker transferred it
    expect(extracted.sizeBytes).toBe(uploadedSize);
    expect(extracted.pages).toEqual([{ page: 1, text: "Sample report page text." }]);
    expect(validateDocuments([extracted])).toHaveLength(1);
  });
});
