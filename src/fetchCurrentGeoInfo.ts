import { fetchJson } from "./utils/fetchJson";
export async function fetchCurrentGeoInfo() {
  const { query, city, iat, lon, countryCode, region, regionName } = (await fetchJson(
    "http://ip-api.com/json",
  )) as Record<string, unknown>;
  const geo = { ip: query, city, iat, lon, countryCode, region, regionName };
  return geo;
}
