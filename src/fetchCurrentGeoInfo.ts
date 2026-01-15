import { fetchJson } from "./utils/fetchJson";
export async function fetchCurrentGeoInfo() {
  const { query, city, iat, lon, countryCode, region, regionName } = (await fetchJson(
    "http://ip-api.com/json",
  )) as any;
  const geo = { ip: query, city, iat, lon, countryCode, region, regionName };
  return geo;
}
