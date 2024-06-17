import yaml from "yaml";
import { spec } from "../spec";

export const GET = async () => new Response(yaml.stringify(spec), { headers: { "Content-Type": "text/yaml" } });
