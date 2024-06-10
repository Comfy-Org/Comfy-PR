import DIE from "@snomiao/die";

export function parseTitleBodyOfMarkdown(tmpl: string) {
  tmpl.startsWith("# ") || DIE("Unrecognized template format:" + tmpl);
  const title = tmpl.split("\n")[0].slice(1).trim();
  const body = tmpl.split("\n").slice(1).join("\n").trim();
  return { title, body };
}
