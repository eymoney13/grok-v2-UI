import type { Metadata } from "next";
import { EPA_MPN_THRESHOLD } from "@/lib/data";
import { NEPTUNE_INDEX } from "@/config/neptune-index";
import { limitBand } from "@/lib/neptuneIndex";
import { NeptuneIndexScale } from "@/components/NeptuneIndex";
import { EditorialSection, PageHero } from "@/components/sandbox/SandboxEditorial";

export const metadata: Metadata = {
  title: "Neptune Index · Neptune",
  description: "The 0–500 Neptune Index: six bands, the orange boundary at the state beach limit, and what each band means for swimming.",
  alternates: { canonical: "https://dashboard.projectneptune.co/california/neptune-index" },
};

export default function NeptuneIndexPage() {
  const orange = limitBand();
  return (
    <>
      <PageHero
        section="The scale"
        title="Neptune Index"
        headline="A 0–500 score for today’s water, read the way people read the air quality index."
        intro="Six fixed bands. The model publishes the number. This site does not calculate one from a lab result or from the exceedance percentage."
      />
      <EditorialSection number="01" title="The scale">
        <NeptuneIndexScale />
        <p>
          0 is the low end and {NEPTUNE_INDEX.scaleMax} is the high end. A higher number is a worse day for swimming.
          Each band has a name and a level, 1 through {NEPTUNE_INDEX.bands.length}, so the color is not the only signal.
          The sentence under each band is general guidance for that range. It is not a lab result, and a posted advisory still comes first.
        </p>
      </EditorialSection>
      <EditorialSection number="02" title="The state limit">
        <p>
          {orange
            ? `The boundary into ${orange.label}, the orange band, is ${orange.min}. That step corresponds to the ${EPA_MPN_THRESHOLD} MPN/100 mL state limit for enterococcus. Scores through ${orange.min - 1} are still below that line on this scale.`
            : `The orange band is the one lined up with the ${EPA_MPN_THRESHOLD} MPN/100 mL state limit.`}
        </p>
        <p>
          The modeling team chooses how a beach’s measurements become a number on this scale. Until a file includes
          {" "}<code>neptune_index</code> or <code>neptune_band</code>, the beach keeps the Under / Near / Over the limit reading.
          A missing score is left blank. It is not filled in from the percentage.
        </p>
      </EditorialSection>
    </>
  );
}
