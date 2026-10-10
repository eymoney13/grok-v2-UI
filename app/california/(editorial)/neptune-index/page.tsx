import type { Metadata } from "next";
import { loadNeptuneIndexScale } from "@/lib/neptuneAdapter";
import { NeptuneIndexLegend } from "@/components/NeptuneIndex";
import { scaleGroups } from "@/lib/neptuneIndex";
import { EditorialSection, PageHero } from "@/components/sandbox/SandboxEditorial";
import { statusReading } from "@/lib/waterStatus";

const emptyIndexReading = `${statusReading("Normal").title}, ${statusReading("Slightly elevated").title}, and ${statusReading("Not recommended").title}`;

export const metadata: Metadata = {
  title: "Neptune Index · Neptune",
  description: `The Neptune Index is a 0–100 score. A higher number is cleaner. Empty index fields stay on ${emptyIndexReading}.`,
  alternates: { canonical: "https://dashboard.projectneptune.co/california/neptune-index" },
};

export default async function NeptuneIndexPage() {
  const scale = await loadNeptuneIndexScale();
  const hasBands = scaleGroups(scale).length > 0;
  return (
    <>
      <PageHero
        section="The scale"
        title="Neptune Index"
        headline="A 0–100 score for today’s water. A higher number is cleaner."
        intro="The model file publishes the number. This site does not calculate one from a lab result or from the exceedance percentage. People who know the air-quality index should read this the other way: a higher Neptune Index is a cleaner day."
      />
      <EditorialSection number="01" title="The scale">
        {hasBands && scale ? (
          <>
            <NeptuneIndexLegend scale={scale} />
            <p>
              {scale.scaleMin} is the low end and {scale.scaleMax} is the high end.
              {scale.higherIsBetter ? " A higher number is cleaner." : ""}
              {" "}The band is the label. The number is the score under it.
              Each roster tier has its own bands, and a tier can list as many as the file gives it.
              The same number can sit in different bands at different beaches.
              The names and the cutoffs come from the published bands file, not from a table baked into this site.
              A posted county advisory still comes first.
            </p>
          </>
        ) : (
          <p>
            This copy of the data does not include the Neptune Index band table.
            Until that file is present, a beach with an index number is shown as a score out of 100, and a beach with no index fields stays on {emptyIndexReading}.
          </p>
        )}
      </EditorialSection>
      <EditorialSection number="02" title="When there is no number">
        <p>
          The modeling team publishes <code>neptune_index</code> and <code>neptune_band</code>.
          When both are empty, the beach keeps the {emptyIndexReading} reading.
          A missing score is left blank. It is not filled in from the percentage.
        </p>
        <p>
          A published band name is shown as written. An official county warning or closure moves a shown band to Poor.
          An advisory does not. A warning does not paint a band onto a score that has none.
          A rules row can publish a number and no band. That number stays uncolored, with a note that it is based on the last lab test and the rain rule.
          When the lab test is old, or the estimate used a fallback, a shown band is grey and the page says why in words.
        </p>
      </EditorialSection>
    </>
  );
}
