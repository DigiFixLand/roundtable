import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Markdown from "@/components/Markdown";

describe("Markdown bidi rendering", () => {
  it("auto-detects prose direction and keeps code LTR", () => {
    const text = "\u0633\u0644\u0627\u0645 RoundTable\n\n```bash\nnpm test\n```";
    const { container } = render(<Markdown>{text}</Markdown>);
    expect(container.querySelector('div[dir="auto"]')).not.toBeNull();
    const code = screen.getByText("npm test");
    expect(code).toHaveAttribute("dir", "ltr");
    expect(code.closest("pre")).toHaveAttribute("dir", "ltr");
  });
});
