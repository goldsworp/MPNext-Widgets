import Link from "next/link";
import { getWidgetsByCategory, type WidgetCategory } from "@/app/(demo)/demo/_lib/widget-catalog";
import { GalleryCard } from "./_components/gallery-card";
import { LightboxProvider } from "./_components/lightbox-provider";
import { getGalleryImages } from "./_lib/gallery-images";

const categoryOrder: WidgetCategory[] = [
  "Authentication",
  "Public",
  "Authenticated",
  "Staff / Admin",
];

export default function GalleryPage() {
  const grouped = getWidgetsByCategory();

  return (
    <LightboxProvider>
      <div className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="text-3xl font-bold text-[#004C97]">Widget Gallery</h1>
        <p className="mt-2 mb-8 max-w-3xl text-gray-600">
          A visual preview of every widget in the MPNext Embed SDK — no MinistryPlatform
          account needed. Click any image to zoom in. If you have access to our demo site,
          visit{" "}
          <Link href="/demo" className="text-[#004C97] underline hover:text-[#002855]">
            /demo
          </Link>{" "}
          to try each widget live with your own data.
        </p>

        {categoryOrder.map((category) => {
          const widgets = grouped[category];
          if (!widgets.length) return null;
          return (
            <section key={category} className="mb-10">
              <h2 className="mb-4 text-lg font-semibold text-[#002855]">{category}</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {widgets.map((widget) => (
                  <GalleryCard
                    key={widget.slug}
                    widget={widget}
                    images={getGalleryImages(widget.slug)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </LightboxProvider>
  );
}
