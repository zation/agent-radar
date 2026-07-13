export const PUBLIC_DOCUMENT_PATHS = [
  "README.md",
  "AGENTS.md",
  "docs/00-product-brief.md",
  "docs/01-requirements.md",
  "docs/02-user-workflows.md",
  "docs/03-system-architecture.md",
  "docs/04-data-model.md",
  "docs/05-taxonomy.md",
  "docs/06-rating-rules.md",
  "docs/07-source-registry.md",
  "docs/08-crawler-and-ingestion.md",
  "docs/09-recommendation-engine.md",
  "docs/10-evaluation-plan.md",
  "docs/11-security-and-trust.md",
  "docs/12-deployment-and-ops.md",
  "docs/13-agent-self-improvement.md",
  "docs/14-web-ui.md",
] as const;

export interface PublicTextDocument {
  path: string;
  content: string;
}

export interface PublicLanguageViolation {
  path: string;
  line: number;
  column: number;
  character: string;
  context: string;
}

const PROHIBITED_CJK_CHARACTER = /[\p{Script=Han}\u3000-\u303f\uff00-\uffef]/u;

export function findPublicLanguageViolations(
  documents: readonly PublicTextDocument[],
): PublicLanguageViolation[] {
  return documents.flatMap((document) => document.content.split("\n").flatMap((line, lineIndex) =>
    Array.from(line).flatMap((character, columnIndex) => PROHIBITED_CJK_CHARACTER.test(character) ? [{
      path: document.path,
      line: lineIndex + 1,
      column: columnIndex + 1,
      character,
      context: line.trim(),
    }] : []),
  ));
}

export function formatPublicLanguageViolation(violation: PublicLanguageViolation): string {
  return `${violation.path}:${violation.line}:${violation.column} prohibited CJK character ${JSON.stringify(violation.character)} in ${violation.context}`;
}
