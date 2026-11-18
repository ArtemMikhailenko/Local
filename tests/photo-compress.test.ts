import { describe, expect, it } from "vitest";
import sharp from "sharp";

import { compress } from "@/lib/photo-compress";

describe("stored venue photos are compressed", () => {
  it("re-encodes a large JPEG to WebP at most 900 px wide and smaller", async () => {
    // A photo-like test image: a gradient with noise, 1600x1000, saved as a high-quality JPEG.
    const w = 1600, h = 1000;
    const raw = Buffer.alloc(w * h * 3);
    for (let i = 0; i < w * h; i++) {
      const x = i % w, y = Math.floor(i / w);
      raw[i * 3] = (x / w) * 255;
      raw[i * 3 + 1] = (y / h) * 255;
      raw[i * 3 + 2] = ((x * 7 + y * 13) % 97) * 2;
    }
    const jpeg = await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
    const out = await compress({ data: jpeg, mime: "image/jpeg" });
    const meta = await sharp(out.data).metadata();
    expect(out.mime).toBe("image/webp");
    expect(meta.width).toBe(900);
    expect(out.data.length).toBeLessThan(jpeg.length);
    console.log(`jpeg ${jpeg.length} B -> webp ${out.data.length} B`);
  });

  it("keeps the original when the bytes are not an image", async () => {
    const bad = { data: Buffer.from("not an image"), mime: "image/jpeg" };
    expect(await compress(bad)).toBe(bad);
  });
});
