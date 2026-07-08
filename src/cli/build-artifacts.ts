import { buildArtifacts } from "../pipeline/build-artifacts.js";
import { config } from "dotenv";

config({ override: false, quiet: true });
const summary = await buildArtifacts({ outputDir: "public" });
console.log(JSON.stringify(summary, null, 2));
