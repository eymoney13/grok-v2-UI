"use client";

import dynamic from "next/dynamic";
import type { Status } from "@/lib/data";
import type { MapBeach } from "./OverviewMap";

const OverviewMap = dynamic(() => import("./OverviewMap"), {
  ssr: false,
  loading: () => (
    <div
      className="flex h-full w-full items-center justify-center bg-gray-100 text-sm text-gray-600"
      role="status"
    >
      Loading map…
    </div>
  ),
});

export default function OverviewMapClient({
  beaches,
  fallbackCenter,
  binaryVerdict,
  labelMinZoom = 0,
  locateNearby = false,
  statusPhrase,
  cluster = false,
  onSelect,
}: {
  beaches: MapBeach[];
  fallbackCenter: [number, number];
  binaryVerdict: boolean;
  labelMinZoom?: number;
  locateNearby?: boolean;
  /** Spoken and hover name for a pin, e.g. "Elevated risk". The drawn pill stays short. */
  statusPhrase?: (status: Status) => string;
  cluster?: boolean;
  onSelect: (code: string) => void;
}) {
  return (
    <div className="h-[460px] w-full sm:h-[560px]">
      <OverviewMap
        locateNearby={locateNearby}
        beaches={beaches}
        fallbackCenter={fallbackCenter}
        labelMinZoom={labelMinZoom}
        binaryVerdict={binaryVerdict}
        statusPhrase={statusPhrase}
        cluster={cluster}
        onSelect={onSelect}
      />
    </div>
  );
}
