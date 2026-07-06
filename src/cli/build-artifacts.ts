import { buildArtifacts } from "../pipeline/build-artifacts.js";

const summary = await buildArtifacts({ outputDir: "public" });
console.log(JSON.stringify(summary, null, 2));
