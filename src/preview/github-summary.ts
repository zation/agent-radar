import type { ArtifactManifest } from "./manifest.js";

export function renderArtifactManifestSummaryMarkdown(manifest: ArtifactManifest): string {
  const lines = [
    "### Artifact Manifest",
    "",
    `- Schema: \`${manifest.schema_version}\``,
    `- Git SHA: \`${manifest.git_sha}\``,
    `- Data version: \`${manifest.data_version}\``,
    `- Eval: ${manifest.eval.passed}/${manifest.eval.total} using \`${manifest.eval.model}\``,
    `- Eval failure categories: ${formatFailureCategories(manifest.eval.failure_categories)}`,
    `- Checksums: ${Object.keys(manifest.checksums).length} files`
  ];
  return `${lines.join("\n")}\n`;
}

function formatFailureCategories(categories: Record<string, number>): string {
  const entries = Object.entries(categories).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) return "`none=0`";
  return entries.map(([category, count]) => `\`${category}=${count}\``).join(", ");
}
