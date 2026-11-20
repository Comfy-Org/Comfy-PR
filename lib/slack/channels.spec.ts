import { describe, expect, it } from "bun:test";
import { getSlackChannel } from "./channels";

type Page = { channels: { id: string; name: string }[]; next?: string };

function fakeSlack(pages: Page[]) {
  const calls: (string | undefined)[] = [];
  const requests: { exclude_archived?: boolean; limit?: number }[] = [];
  const slack = {
    conversations: {
      list: async (args: { cursor?: string; exclude_archived?: boolean; limit?: number }) => {
        calls.push(args.cursor);
        requests.push({ exclude_archived: args.exclude_archived, limit: args.limit });
        if (calls.length > pages.length + 1) throw new Error("fake: too many list requests");
        const i = args.cursor ? Number(args.cursor) : 0;
        const page = pages[i];
        return {
          ok: true,
          channels: page.channels,
          response_metadata: { next_cursor: page.next ?? "" },
        };
      },
    },
  };
  return { slack: slack as never, calls, requests };
}

describe("getSlackChannel", () => {
  it("finds a channel on a later page", async () => {
    const { slack, calls, requests } = fakeSlack([
      { channels: [{ id: "C1", name: "general" }], next: "1" },
      { channels: [{ id: "C2", name: "epd-desktop" }] },
    ]);
    const ch = await getSlackChannel("epd-desktop", slack);
    expect(ch.id).toBe("C2");
    expect(ch.url).toBe("https://slack.com/app_redirect?channel=C2");
    expect(calls).toEqual([undefined, "1"]);
    // Every page skips archived channels and stays within Slack's page size.
    expect(requests).toEqual([
      { exclude_archived: true, limit: 200 },
      { exclude_archived: true, limit: 200 },
    ]);
  });

  it("stops at the first page that has the channel", async () => {
    const { slack, calls } = fakeSlack([
      { channels: [{ id: "C1", name: "general" }], next: "1" },
      { channels: [{ id: "C2", name: "other" }] },
    ]);
    expect((await getSlackChannel("general", slack)).id).toBe("C1");
    expect(calls).toEqual([undefined]);
  });

  it("names the channel when no page has it", async () => {
    const { slack } = fakeSlack([{ channels: [{ id: "C1", name: "general" }] }]);
    await expect(getSlackChannel("desktop", slack)).rejects.toThrow(/#desktop not found/);
  });

  it("stops when Slack repeats a cursor", async () => {
    const { slack, calls } = fakeSlack([
      { channels: [{ id: "C1", name: "general" }], next: "1" },
      { channels: [{ id: "C2", name: "other" }], next: "1" },
    ]);
    await expect(getSlackChannel("missing", slack)).rejects.toThrow(/cursor 1 twice/);
    expect(calls).toEqual([undefined, "1"]);
  });

  it("shares one lookup between concurrent callers and reuses it", async () => {
    const { slack, calls } = fakeSlack([{ channels: [{ id: "C1", name: "general" }] }]);
    const [a, b] = await Promise.all([
      getSlackChannel("general", slack),
      getSlackChannel("general", slack),
    ]);
    expect([a.id, b.id]).toEqual(["C1", "C1"]);
    await getSlackChannel("general", slack);
    expect(calls).toEqual([undefined]);
  });

  it("does not remember a failed lookup", async () => {
    const { slack, calls } = fakeSlack([{ channels: [{ id: "C1", name: "general" }] }]);
    await expect(getSlackChannel("desktop", slack)).rejects.toThrow(/#desktop not found/);
    await expect(getSlackChannel("desktop", slack)).rejects.toThrow(/#desktop not found/);
    expect(calls).toEqual([undefined, undefined]);
  });
});
