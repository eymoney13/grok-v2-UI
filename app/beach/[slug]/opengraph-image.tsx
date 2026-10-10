import { ImageResponse } from "next/og";
import { dailySummary } from "@/lib/dailySummary";
import { resolvePublicBeach } from "@/lib/publicCatalog";
import { copyReading, officialPosting } from "@/lib/publishedReading";

export const runtime = "nodejs";
export const alt = "California beach water quality";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const beach = await resolvePublicBeach((await params).slug);
  const name = beach?.name ?? "California beach";
  const status = beach ? dailySummary(beach, "en").status : "No reading published.";
  const posted = beach ? officialPosting(copyReading(beach)) : null;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f4f7f7",
          color: "#142226",
          padding: "64px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 28, fontWeight: 700, color: "#0e6f78" }}>Neptune</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 700, lineHeight: 1.1 }}>{name}</div>
          <div style={{ display: "flex", fontSize: 32, lineHeight: 1.35, color: "#24383c" }}>{status.slice(0, 180)}</div>
        </div>
        <div style={{ display: "flex", fontSize: 24, color: "#3d4c50" }}>
          {posted
            ? "Official posting shown first. Our estimate is still a model figure, not a water sample."
            : "California beach water quality. A model estimate, not a water sample."}
        </div>
      </div>
    ),
    size
  );
}
