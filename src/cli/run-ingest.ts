import { runIngestion } from "../ingestion/run.js";

const result = await runIngestion({ outputDir: "." });

console.log(
  JSON.stringify(
    {
      snapshots: result.snapshots.length,
      source_records: result.sourceRecords.length,
      source_ids: [...new Set(result.snapshots.map((snapshot) => snapshot.source_id))]
    },
    null,
    2
  )
);
