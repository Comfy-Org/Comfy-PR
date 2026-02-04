import DIE from "@snomiao/die";
import gh from "parse-github-url";

export const ghUrl = (s: string) => gh(s) || DIE("fail to parse github url from " + s);
