import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  PUBLIC_DOCUMENT_PATHS,
  findPublicLanguageViolations,
  formatPublicLanguageViolation,
} from "../validation/public-language.js";

const root = process.cwd();
const documents = await Promise.all(PUBLIC_DOCUMENT_PATHS.map(async (path) => ({
  path,
  content: await readFile(resolve(root, path), "utf8"),
})));
const violations = findPublicLanguageViolations(documents);

if (violations.length > 0) {
  for (const violation of violations) console.error(formatPublicLanguageViolation(violation));
  process.exitCode = 1;
} else {
  console.log(`Public language check passed: ${documents.length} files.`);
}
