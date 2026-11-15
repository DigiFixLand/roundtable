import { describe, it, expect } from "vitest";
import { documentContext, validateDocuments, MAX_DOCUMENT_CHARS } from "@/lib/documents";
import { useArenaStore } from "@/lib/store";
import { encodeSnapshotToHash } from "@/lib/session";
import type { AttachedDocument } from "@/lib/documents";
const doc: AttachedDocument = {
  id: "1234567890-abcdef",
  name: "Quarterly_Report.pdf",
  format: "pdf",
  sizeBytes: 150_000,
  pages: [
    { page: 1, text: "The system is in pilot testing." },
    { page: 2, text: "Release is pending review approval." },
  ],
  charCount:
    "The system is in pilot testing.".length + "Release is pending review approval.".length,
};
describe("document attachments", () => {
  it("validates multi-page text and preserves citations without truncation", () => {
    const valid = validateDocuments([doc]);
    expect(valid).toHaveLength(1);
    const context = documentContext(valid);
    expect(context).toContain("Quarterly_Report.pdf");
    expect(context).toContain("page 2");
    expect(context).toContain("Release is pending review approval.");
    expect(context).toContain("UNTRUSTED SOURCE MATERIAL");
  });
  it("rejects fabricated page counts and duplicated pages", () => {
    expect(() => validateDocuments([{ ...doc, charCount: 0 }])).toThrow();
    expect(() =>
      validateDocuments([
        {
          ...doc,
          pages: [
            { page: 1, text: "A" },
            { page: 1, text: "B" },
          ],
          charCount: 2,
        },
      ]),
    ).toThrow("Duplicate");
  });
  it("enforces combined document limit and 6-file limit", () => {
    expect(() => validateDocuments(Array(7).fill(doc))).toThrow();
    const tooBig = { ...doc, pages: [{ page: 1, text: "Z".repeat(20_001) }], charCount: 20_001 };
    expect(() => validateDocuments([tooBig])).toThrow();
    expect(MAX_DOCUMENT_CHARS).toBeGreaterThan(28_989);
  });
  it("keeps source text in the saved snapshot and prevents public permalinks", async () => {
    const s = useArenaStore.getState();
    s.addDocument(doc);
    const snapshot = useArenaStore.getState().getSnapshot();
    expect(snapshot.documents?.[0].pages[1].text).toContain("pending review");
    await expect(encodeSnapshotToHash(snapshot)).rejects.toThrow("disabled");
    useArenaStore.getState().removeDocument(doc.id);
    expect(useArenaStore.getState().documents).toHaveLength(0);
  });
});
