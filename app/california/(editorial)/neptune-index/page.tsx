import type { Metadata } from "next";
import { loadNeptuneIndexScale } from "@/lib/neptuneAdapter";
import { NeptuneIndexLegend } from "@/components/NeptuneIndex";
import { scaleGroups, swimWords } from "@/lib/neptuneIndex";
import { EditorialSection, PageHero } from "@/components/sandbox/SandboxEditorial";

export const metadata: Metadata = {
  title: "Neptune Index · Neptune",
  description:
    "The Neptune Index runs from 0 to 100. A lower number is cleaner water. 50 means about a 50% chance the water is over the limit.",
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
        headline="A lower number is cleaner water."
        intro="The index runs from 0 to 100. 50 means about a 50% chance the water is over the limit. Safe to swim, Use caution, and Not safe sit next to the band name and the number. Every beach uses the same scale."
      />
      <EditorialSection number="01" title="The scale">
        {hasBands && scale ? (
          <>
            <NeptuneIndexLegend scale={scale} />
            <p>
              {scale.scaleMin} is the clean end and {scale.scaleMax} is the high end.
              {" "}A lower number is cleaner water.
              {" "}The words are {swimWords("good", "en")}, {swimWords("moderate", "en")}, and {swimWords("likely_unsafe", "en")}.
              {" "}The names and the ranges come from the bands file, not from a table baked into this site.
              {" "}A county warning or closure comes first and stays easy to see.
              {" "}A lab test over the limit says Over the limit.
            </p>
          </>
        ) : (
          <p>This copy of the data does not include the Neptune Index band table.</p>
        )}
      </EditorialSection>
      <EditorialSection number="02" title="When there is no number">
        <p>
          When the file has no probability, the page does not invent an index.
          {" "}Not enough recent data to call stays that sentence.
          {" "}A beach with no lab test in the file says Not tested yet.
          {" "}Limited data is a label on the same scale, not a different cutoff.
        </p>
      </EditorialSection>
    </>
  );
}
