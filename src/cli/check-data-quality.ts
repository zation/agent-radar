import { readFile } from "node:fs/promises";
import { assertDataQualityReport, type DataQualityReport } from "../validation/data-quality-report.js";

const reportPath = process.argv[2] ?? "public/data/data_quality_report.json";
const report = JSON.parse(await readFile(reportPath, "utf8")) as DataQualityReport;
if (report.schema_version !== "data_quality_report.v1") {
  throw new Error("data_quality_report_invalid_schema");
}
assertDataQualityReport(report);
console.log(`Data quality passed: ${report.tool_cards.total} Tool Cards, ${report.gates.length} gates`);
