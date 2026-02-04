import { describe, expect, it } from "bun:test";
import { slackTsToISO } from "./slackTsToISO";

describe("slackTsToISO", () => {
  it("should convert Slack timestamp to ISO format", () => {
    const ts = "1703347200.123456";
    const iso = slackTsToISO(ts);
    expect(iso).toBe("2023-12-23T16:00:00.123Z");
  });

  it("should handle timestamp with zeros in microseconds", () => {
    const ts = "1703347200.000000";
    const iso = slackTsToISO(ts);
    expect(iso).toBe("2023-12-23T16:00:00.000Z");
  });

  it("should handle timestamp with different microseconds", () => {
    const ts = "1703347200.999000";
    const iso = slackTsToISO(ts);
    expect(iso).toBe("2023-12-23T16:00:00.999Z");
  });

  it("should handle epoch timestamp", () => {
    const ts = "0.000000";
    const iso = slackTsToISO(ts);
    expect(iso).toBe("1970-01-01T00:00:00.000Z");
  });
});
