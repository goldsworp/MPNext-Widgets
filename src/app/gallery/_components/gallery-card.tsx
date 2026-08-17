import type { WidgetConfig } from "@/app/(demo)/demo/_lib/widget-catalog";
import type { GalleryImage } from "../_lib/gallery-images";
import { LightboxThumbnail } from "./lightbox-thumbnail";

const categoryColors: Record<string, { bg: string; text: string; border: string }> = {
  Public: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  Authenticated: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  "Staff / Admin": { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  Authentication: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
};

export function GalleryCard({
  widget,
  images,
}: {
  widget: WidgetConfig;
  images: GalleryImage[];
}) {
  const colors = categoryColors[widget.category] ?? categoryColors.Public;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="text-lg font-semibold text-[#2D2926]">{widget.title}</h3>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${colors.bg} ${colors.text} ${colors.border}`}
        >
          {widget.category}
        </span>
      </div>
      <p className="mb-4 text-sm text-gray-600">{widget.description}</p>

      {images.length > 0 ? (
        <div className={`grid gap-3 ${images.length > 1 ? "sm:grid-cols-2" : ""}`}>
          {images.map((img) => (
            <div
              key={img.src}
              className="overflow-hidden rounded-lg border border-gray-100 bg-gray-50"
            >
              <LightboxThumbnail
                src={img.src}
                alt={img.caption ? `${widget.title}: ${img.caption}` : `${widget.title} preview`}
                width={img.width}
                height={img.height}
              />
              {img.caption && (
                <div className="border-t border-gray-100 bg-white px-2 py-1.5 text-center text-xs text-gray-500">
                  {img.caption}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-400">
          Preview coming soon
        </div>
      )}

      <code className="mt-4 block text-xs text-gray-400">&lt;{widget.tag}&gt;</code>
    </div>
  );
}
