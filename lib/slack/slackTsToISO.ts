/**
 * Convert Slack timestamp to ISO 8601 format
 * Slack timestamps are in the format: "1234567890.123456"
 * where the integer part is Unix timestamp in seconds
 */
export function slackTsToISO(ts: string): string {
  const [seconds, microseconds] = ts.split(".");
  const milliseconds = parseInt(seconds) * 1000 + parseInt(microseconds.slice(0, 3));
  return new Date(milliseconds).toISOString();
}

if (import.meta.main) {
  // Test example
  const exampleTs = "1703347200.123456";
  console.log(`Slack TS: ${exampleTs}`);
  console.log(`ISO: ${slackTsToISO(exampleTs)}`);
}
