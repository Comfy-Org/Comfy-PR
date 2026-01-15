"use client";

import { EChart } from "@kbox-labs/react-echarts";
import { omit, uniq } from "rambda";

export function TotalsChart({
  totalsData,
}: {
  totalsData: ({ date: string } & Record<string, number>)[];
}) {
  return (
    <EChart
      style={{
        height: "600px",
        width: "100%",
      }}
      xAxis={[
        {
          type: "time",
          axisLabel: {
            formatter: function (value) {
              return new Date(value).toISOString().slice(0, 10);
            },
          },
        },
      ]}
      yAxis={{
        type: "value",
      }}
      series={uniq(totalsData.flatMap((e) => Object.keys(omit("date", e)))).map((key) => ({
        type: "line",
        data: totalsData.map((e) => [e.date, e[key] ?? null]),
      }))}
    />
  );
}
