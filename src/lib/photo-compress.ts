import sharp from "sharp";

/**
 * Re-encode for storage: at most 900 px wide, WebP quality 80 (visually close to the original,
 * usually half the size of Google's JPEG). Falls back to the original bytes if encoding fails.
 */
export async function compress(file: { data: Buffer; mime: string }): Promise<{ data: Buffer; mime: string }> {
  try {
    const data = await sharp(file.data).rotate().resize({ width: 900, withoutEnlargement: true }).webp({ quality: 80, effort: 4 }).toBuffer();
    return data.length < file.data.length ? { data, mime: "image/webp" } : file;
  } catch {
    return file;
  }
}
