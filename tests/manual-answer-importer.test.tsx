// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useArenaStore } from "@/lib/store";
import ManualAnswerImporter from "@/components/setup/ManualAnswerImporter";
import { validateDocuments } from "@/lib/documents";
import { encodeSnapshotToHash, snapshotToMarkdown } from "@/lib/session";

beforeEach(() => {
  useArenaStore.setState({
    documents: [],
    prompt: "What are the major operational risks?",
    isRunning: false,
  });
  vi.stubGlobal("crypto", { randomUUID: () => "abcdef12-abcdef34-abcdef56" });
});
afterEach(() => {
  vi.unstubAllGlobals();
  useArenaStore.setState({ documents: [], prompt: "", isRunning: false });
});

describe("ManualAnswerImporter", () => {
  it("attaches a pasted external answer locally without calling an API", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    render(<ManualAnswerImporter />);
    fireEvent.change(screen.getByLabelText("Source website"), { target: { value: "NotebookLM" } });
    fireEvent.change(screen.getByLabelText("Paste the answer"), {
      target: {
        value:
          "The report calls for independent backup verification, rather than an immediate deployment.",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /Attach manual answer/ }));
    const docs = useArenaStore.getState().documents;
    expect(docs).toHaveLength(1);
    expect(docs[0].name).toBe("notebooklm-manual-answer.txt");
    expect(docs[0].pages[0].text).toContain("user-pasted; unverified");
    expect(docs[0].pages[0].text).toContain("NOT an independent RoundTable voting seat");
    expect(validateDocuments(docs)).toHaveLength(1);
    expect(mockFetch).not.toHaveBeenCalled();
    const snapshot = useArenaStore.getState().getSnapshot();
    await expect(encodeSnapshotToHash(snapshot)).rejects.toThrow("disabled");
    const markdown = snapshotToMarkdown(snapshot);
    expect(markdown).toContain("RoundTable Session");
    expect(markdown).toContain("User-pasted external AI answer");
    expect(markdown).toContain("independent backup verification");
  });
  it("rejects short pasted answers", () => {
    render(<ManualAnswerImporter />);
    fireEvent.change(screen.getByLabelText("Paste the answer"), {
      target: { value: "Too short" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Attach manual answer/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("at least 20");
    expect(useArenaStore.getState().documents).toHaveLength(0);
  });
});
