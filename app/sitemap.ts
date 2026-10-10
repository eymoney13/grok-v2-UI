import type { MetadataRoute } from "next";
import { LOCATIONS } from "@/lib/data";
import { loadPublicCatalog } from "@/lib/publicCatalog";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = ["/", ...Object.values(LOCATIONS).filter((c) => !c.noindex && c.slug !== "southbay").map((c) => `/${c.slug}`)];
  pages.push(...["how-it-works", "neptune-index", "stories", "team", "terms", "privacy"].map((p) => `/california/${p}`));
  const catalog = await loadPublicCatalog();
  pages.push(...catalog.beaches.map((beach) => `/beach/${beach.slug}`));
  return pages.map((path) => ({ url: `https://dashboard.projectneptune.co${path}` }));
}
