// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useArenaStore } from "@/lib/store";
import DocumentUploader from "@/components/setup/DocumentUploader";
import type { AttachedDocument } from "@/lib/documents";
const sample: AttachedDocument = {
  id: "12345678-abcdefgh",
  name: "Quarterly_Report.pdf",
  format: "pdf",
  sizeBytes: 152000,
  pages: [{ page: 1, text: "Quarterly report analysis" }],
  charCount: "Quarterly report analysis".length,
};
beforeEach(() => {
  useArenaStore.setState({ documents: [], isRunning: false });
});
afterEach(() => {
  vi.unstubAllGlobals();
  useArenaStore.setState({ documents: [], isRunning: false });
});
describe("DocumentUploader", () => {
  it("shows upload control and stores the extracted document", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ document: sample }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<DocumentUploader />);
    const input = screen.getByLabelText("Upload document");
    fireEvent.change(input, {
      target: {
        files: [new File(["%PDF-demo"], "Quarterly_Report.pdf", { type: "application/pdf" })],
      },
    });
    expect(await screen.findByText("Quarterly_Report.pdf")).toBeInTheDocument();
    expect(useArenaStore.getState().documents[0].charCount).toBe(sample.charCount);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Remove Quarterly_Report.pdf" }));
    await waitFor(() => expect(useArenaStore.getState().documents).toHaveLength(0));
  });
  it("rejects files larger than 8MB before sending", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<DocumentUploader />);
    const oversized = new File([new Uint8Array(8 * 1024 * 1024 + 1)], "too-big.pdf");
    fireEvent.change(screen.getByLabelText("Upload document"), { target: { files: [oversized] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("8 MB");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
