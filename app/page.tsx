import type { Metadata } from "next";
import NearMeHome from "@/components/public/NearMeHome";
import { LanguageProvider } from "@/components/public/Language";
import { loadPublicCatalog } from "@/lib/publicCatalog";
import { toGlance } from "@/lib/publicBeach";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Beaches near me",
  description:
    "Today’s ocean water quality for the California beaches closest to you. No account. A model estimate, not a water sample.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Beaches near me",
    description: "Today’s ocean water quality for the California beaches closest to you.",
    url: "/",
    type: "website",
  },
};

export default async function Home() {
  const catalog = await loadPublicCatalog();
  return (
    <LanguageProvider>
      <NearMeHome
        beaches={catalog.beaches.map(toGlance)}
        predictionDate={catalog.predictionDate}
        readingsCurrent={catalog.readingsCurrent}
        staleCounties={catalog.staleCounties}
      />
    </LanguageProvider>
  );
}
