import { describe, expect, it } from "bun:test";
import { getSlackChannel } from "./channels";

type Page = { channels: { id: string; name: string }[]; next?: string };

function fakeSlack(pages: Page[]) {
  const calls: (string | undefined)[] = [];
  const slack = {
    conversations: {
      list: async (args: { cursor?: string }) => {
        calls.push(args.cursor);
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
  return { slack: slack as never, calls };
}

describe("getSlackChannel", () => {
  it("finds a channel on a later page", async () => {
    const { slack, calls } = fakeSlack([
      { channels: [{ id: "C1", name: "general" }], next: "1" },
      { channels: [{ id: "C2", name: "epd-desktop" }] },
    ]);
    const ch = await getSlackChannel("epd-desktop", slack);
    expect(ch.id).toBe("C2");
    expect(ch.url).toBe("https://slack.com/app_redirect?channel=C2");
    expect(calls).toEqual([undefined, "1"]);
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
});
