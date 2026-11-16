import { useMemo } from "react";
import type { series } from "@/lib/data";
/** Rescales simulated samples to the selected demonstration period. */
export function useTimeSeriesConfig(
  data: ReturnType<typeof series>,
  range: string,
) {
  return useMemo(
    () =>
      data.map((sample, index) => ({
        ...sample,
        time:
          range === "24 hours"
            ? `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`
            : `Day ${1 + Math.floor((index / (data.length - 1)) * (range === "7 days" ? 6 : 29))}`,
      })),
    [data, range],
  );
}
