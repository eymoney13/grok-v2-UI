import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import BeachPublic from "@/components/public/BeachPublic";
import { LanguageProvider } from "@/components/public/Language";
import { dailySummary } from "@/lib/dailySummary";
import { hasMapCoordinates, nearest } from "@/lib/geo";
import { loadPublicCatalog, resolvePublicBeach } from "@/lib/publicCatalog";
import { toGlance } from "@/lib/publicBeach";

export const revalidate = 3600;
export const dynamicParams = true;

const LA_ADVISORY = {
  label: "LA County Department of Public Health",
  href: "http://publichealth.lacounty.gov/phcommon/public/media/mediapubOdisplay.cfm",
};
const ORANGE_ADVISORY = { label: "OC Beach Info", href: "https://ocbeachinfo.com/" };

export async function generateStaticParams() {
  const catalog = await loadPublicCatalog();
  return catalog.beaches.map((beach) => ({ slug: beach.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const beach = await resolvePublicBeach(slug);
  if (!beach) return { title: "Beach" };
  const summary = dailySummary(beach, "en");
  const description = [summary.status, summary.postingNote, summary.rainAdvisory, summary.lastTested, summary.outlook]
    .filter((part): part is string => Boolean(part))
    .map((part) => (/[.!?]$/.test(part) ? part : `${part}.`))
    .join(" ")
    .slice(0, 280);
  const title = `${beach.name} water quality`;
  const path = `/beach/${beach.slug}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      type: "website",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function BeachPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const beach = await resolvePublicBeach(slug);
  if (!beach) notFound();
  if (beach.slug !== slug) redirect(`/beach/${beach.slug}`);
  const catalog = await loadPublicCatalog();
  const nearby = hasMapCoordinates(beach)
    ? nearest(beach, catalog.beaches, 5, undefined, beach.slug).map(toGlance)
    : [];
  const advisory = beach.county?.toLowerCase() === "orange" ? ORANGE_ADVISORY : LA_ADVISORY;
  return (
    <LanguageProvider>
      <BeachPublic
        beach={beach}
        nearby={nearby}
        predictionDate={catalog.predictionDate}
        readingsCurrent={catalog.readingsCurrent}
        advisory={advisory}
      />
    </LanguageProvider>
  );
}
