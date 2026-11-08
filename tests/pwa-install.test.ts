import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const manifest = JSON.parse(
  readFileSync(join(root, "public", "site.webmanifest"), "utf8"),
);

describe("RoundTable installable web app", () => {
  it("has an installable same-origin manifest", () => {
    expect(manifest.name).toBe("RoundTable");
    expect(manifest.short_name).toBe("RoundTable");
    expect(manifest.id).toBe("/");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("has actual 192 and 512 PNG icons and a home-screen icon", () => {
    for (const size of [192, 512]) {
      const icon = manifest.icons.find(
        (entry: { sizes: string }) => entry.sizes === `${size}x${size}`,
      );
      expect(icon?.type).toBe("image/png");
      expect(icon.src).toMatch(/^\/[^/]+\.png$/);
      expect(existsSync(join(root, "public", icon.src.slice(1)))).toBe(true);
    }
    expect(existsSync(join(root, "public", "apple-touch-icon.png"))).toBe(true);
  });
});
