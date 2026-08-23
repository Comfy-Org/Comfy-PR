export function slackTsToISO(ts: string): string {
  const [seconds, microseconds] = ts.split(".");
  const ms = parseInt(seconds) * 1000 + parseInt((microseconds || "000").slice(0, 3));
  return new Date(ms).toISOString();
}
