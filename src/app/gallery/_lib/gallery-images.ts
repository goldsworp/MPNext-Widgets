import fs from "fs";
import path from "path";

const GALLERY_DIR = path.join(process.cwd(), "public", "gallery");

export interface GalleryImage {
  src: string;
  width: number;
  height: number;
}

function readPngSize(filePath: string): { width: number; height: number } {
  const buf = Buffer.alloc(24);
  const fd = fs.openSync(filePath, "r");
  fs.readSync(fd, buf, 0, 24, 0);
  fs.closeSync(fd);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/**
 * Looks up captured gallery screenshots for a widget slug ({slug}.png,
 * optionally {slug}-2.png for a second hero shot). Reads real dimensions
 * from each PNG's header rather than hardcoding them, so the page stays
 * correct as screenshots are re-captured or added.
 */
export function getGalleryImages(slug: string): GalleryImage[] {
  const images: GalleryImage[] = [];
  for (const suffix of ["", "-2"]) {
    const filename = `${slug}${suffix}.png`;
    const filePath = path.join(GALLERY_DIR, filename);
    if (!fs.existsSync(filePath)) continue;
    const { width, height } = readPngSize(filePath);
    images.push({ src: `/gallery/${filename}`, width, height });
  }
  return images;
}
