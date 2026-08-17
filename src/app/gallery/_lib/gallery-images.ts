import fs from "fs";
import path from "path";

const GALLERY_DIR = path.join(process.cwd(), "public", "gallery");
const MAX_IMAGES_PER_WIDGET = 6;

export interface GalleryImage {
  src: string;
  width: number;
  height: number;
  caption?: string;
}

// Manual captions for the widgets where multiple images need labeling to be
// useful (e.g. distinguishing Full Calendar's different views) — indexed to
// match capture order (index 0 = {slug}.png, 1 = {slug}-2.png, ...).
// Widgets not listed here just render without captions.
const CAPTIONS: Record<string, string[]> = {
  "full-calendar": ["Month view", "Grid view", "Week view", "List view", "Cards view"],
  "space-availability": ["Checking availability with the capacity filter", "Requesting a room"],
};

function readPngSize(filePath: string): { width: number; height: number } {
  const buf = Buffer.alloc(24);
  const fd = fs.openSync(filePath, "r");
  fs.readSync(fd, buf, 0, 24, 0);
  fs.closeSync(fd);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/**
 * Looks up captured gallery screenshots for a widget slug ({slug}.png,
 * {slug}-2.png, {slug}-3.png, ...). Reads real dimensions from each PNG's
 * header rather than hardcoding them, so the page stays correct as
 * screenshots are re-captured or added.
 */
export function getGalleryImages(slug: string): GalleryImage[] {
  const images: GalleryImage[] = [];
  const captions = CAPTIONS[slug];
  for (let i = 0; i < MAX_IMAGES_PER_WIDGET; i++) {
    const suffix = i === 0 ? "" : `-${i + 1}`;
    const filename = `${slug}${suffix}.png`;
    const filePath = path.join(GALLERY_DIR, filename);
    if (!fs.existsSync(filePath)) continue;
    const { width, height } = readPngSize(filePath);
    images.push({ src: `/gallery/${filename}`, width, height, caption: captions?.[i] });
  }
  return images;
}
