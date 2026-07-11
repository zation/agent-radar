import { ensureDevData } from "../dev/ensure-data.js";

const PRODUCTION_ORIGIN = "https://agent-radar.zation1.workers.dev";

const result = await ensureDevData({
  dataDir: "public/data",
  productionOrigin: PRODUCTION_ORIGIN
});

console.log(`dev data ready: ${result.fileCount} artifacts from ${result.source}`);

