import {
  JAVA_TEST_STATIC_IMPORTS,
  JAVA_WILDCARD_IMPORTS,
} from '../../conventions/java-conventions.mjs';
import { isTestSource } from '../../conventions/measures/java-imports.mjs';
import type { JavaFinding, SourceReader } from '../typed/java-values.mts';
import { fieldOf } from '../../../../shared/values/readers.mts';

const STAR_IMPORT_RULES = new Set(['checkstyle/AvoidStarImport', 'errorprone/WildcardImport']);
const STATIC_IMPORT = /^\s*import\s+static\b/;

function isStaticImportLine(finding: JavaFinding, readSource: SourceReader): boolean {
  const line = finding.location?.line;
  const text = line === undefined ? undefined : readSource(finding.path);
  return (
    line !== undefined &&
    text !== undefined &&
    STATIC_IMPORT.test(text.split(/\r?\n/)[line - 1] ?? '')
  );
}

export function withoutFollowedImports<T extends JavaFinding>(
  findings: readonly T[],
  conventions: unknown = {},
  readSource: SourceReader = () => undefined,
): readonly T[] {
  const allowAll = fieldOf(conventions, JAVA_WILDCARD_IMPORTS) === 'wildcard';
  const allowStaticInTests = fieldOf(conventions, JAVA_TEST_STATIC_IMPORTS) === 'wildcard';
  if (!allowAll && !allowStaticInTests) {
    return findings;
  }
  return findings.filter((finding) => {
    if (!STAR_IMPORT_RULES.has(`${finding.tool}/${finding.rule}`)) {
      return true;
    }
    return !(allowAll || (isTestSource(finding.path) && isStaticImportLine(finding, readSource)));
  });
}
