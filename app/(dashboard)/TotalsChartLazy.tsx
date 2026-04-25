"use client";
import dynamic from "next/dynamic";

const TotalsChart = dynamic(
  () => import("./TotalsChart").then((m) => ({ default: m.TotalsChart })),
  { ssr: false, loading: () => <div>Loading chart...</div> },
);

export { TotalsChart };
