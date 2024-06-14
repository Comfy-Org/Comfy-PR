import { readFile } from "fs/promises";
import { parseTitleBodyOfMarkdown } from "./parseTitleBodyOfMarkdown";

export async function readTemplateTitle(filename: string) {
  return await readTemplate(filename).then((e) => e.title);
}
export async function readTemplate(filename: string) {
  return readFile("./templates/" + filename, "utf8").then(
    parseTitleBodyOfMarkdown,
  );
}
