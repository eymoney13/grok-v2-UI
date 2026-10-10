import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { resolveSlugMatch } from "@/lib/beachSlug";
import AccountControl from "@/components/AccountControl";
import CaliforniaBeachPage from "@/components/sandbox/CaliforniaBeachPage";
import { getLocation, toBeachListItem } from "@/lib/data";
import { loadDashboardData } from "@/lib/loadData";
import { isEntitled } from "@/lib/entitlement";
import { isClerkConfigured } from "@/lib/clerkConfig";
import { isStripeConfigured } from "@/lib/subscription";
import { redactForEntitlement } from "@/lib/paywall";
import { featuresFor } from "@/lib/features";
import { calendarDay, lastUpdatedDisplay } from "@/lib/waterStatus";

export const dynamic = "force-dynamic";

const DEFAULT_ADVISORY = {
  label: "LA County Department of Public Health",
  href: "http://publichealth.lacounty.gov/phcommon/public/media/mediapubOdisplay.cfm",
};
const ORANGE_ADVISORY = { label: "OC Beach Info", href: "https://ocbeachinfo.com/" };

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const code = decodeURIComponent((await params).code);
  const config = getLocation("california");
  const data = config ? await loadDashboardData(config) : null;
  const match = data
    ? resolveSlugMatch(
        [...data.beaches, ...data.unmodeled].map((beach) => ({
          slug: beach.id,
          code: beach.code,
          name: beach.name,
          stationKey: beach.stationKey,
        })),
        code
      )
    : null;
  return {
    title: `${match?.name ?? "Beach"} water quality`,
    description: "Today’s enterococcus estimate, the latest lab tests, and the experimental look-ahead.",
  };
}

export default async function BeachPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const code = decodeURIComponent((await params).code);
  const from = (await searchParams).from === "list" ? "list" : "map";
  const config = getLocation("california");
  if (!config) notFound();
  const features = featuresFor("california");
  const [data, entitled] = await Promise.all([
    loadDashboardData(config, { includeLabHistory: true }),
    features.paywall ? isEntitled() : Promise.resolve(false),
  ]);
  const beaches = redactForEntitlement(data.beaches, {
    entitled,
    features,
    publicTodayInsights: true,
  });
  const catalog = [...beaches.map(toBeachListItem), ...data.unmodeled];
  const listItem = resolveSlugMatch(
    catalog.map((item) => ({ ...item, slug: item.id })),
    code
  );
  if (!listItem) notFound();
  if (code !== listItem.id) redirect(`/california/beach/${encodeURIComponent(listItem.id)}`);
  const beach = beaches.find((item) => item.id === listItem.id) ?? null;
  const { isPaymentFirstEnabled } = await import("@/lib/purchase");
  const neighbors = catalog
    .filter((item) => item.id !== listItem.id && Number.isFinite(item.latitude) && Number.isFinite(item.longitude) && Number.isFinite(listItem.latitude))
    .sort((a, b) => distance(listItem, a) - distance(listItem, b))
    .slice(0, 8);
  const advisory = listItem.county?.toLowerCase() === "orange" ? ORANGE_ADVISORY : config.advisory ?? DEFAULT_ADVISORY;
  return (
    <CaliforniaBeachPage
      beach={beach}
      listItem={listItem}
      neighbors={neighbors}
      choices={[...beaches.map(toBeachListItem), ...data.unmodeled]}
      labHistory={beach?.labHistory ?? []}
      updated={lastUpdatedDisplay(data.generatedAt, data.predictionDate, config.timeZone)}
      readingsCurrent={!data.predictionDate || data.predictionDate >= calendarDay(config.timeZone)}
      predictionDate={data.predictionDate}
      entitled={entitled}
      alertsEnabled={features.beachAlerts}
      checkoutReady={isClerkConfigured() && isStripeConfigured() && isPaymentFirstEnabled()}
      advisory={advisory}
      backTo={from}
      account={<AccountControl location="california" hideAvatar={entitled} />}
    />
  );
}

function distance(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = Math.PI / 180;
  return (a.latitude - b.latitude) ** 2 + (a.longitude - b.longitude) ** 2 * Math.cos(a.latitude * rad) ** 2;
}
