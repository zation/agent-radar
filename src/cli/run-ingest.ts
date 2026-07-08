import { formatIngestionCliSummary } from "./ingest-summary.js";
import { runIngestion } from "../ingestion/run.js";

const result = await runIngestion({ outputDir: "." });

console.log(JSON.stringify(formatIngestionCliSummary(result), null, 2));
