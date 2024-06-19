export function jsonSanitize<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
