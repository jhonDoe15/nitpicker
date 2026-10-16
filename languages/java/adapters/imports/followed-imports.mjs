import {
  JAVA_TEST_STATIC_IMPORTS,
  JAVA_WILDCARD_IMPORTS,
} from '../../conventions/java-conventions.mjs';
import { isTestSource } from '../../conventions/measures/java-imports.mjs';

const STAR_IMPORT_RULES = new Set(['checkstyle/AvoidStarImport', 'errorprone/WildcardImport']);
const STATIC_IMPORT = /^\s*import\s+static\b/;

function isStaticImportLine(finding, readSource) {
  const line = finding.location?.line;
  const text = line === undefined ? undefined : readSource(finding.path);
  return text !== undefined && STATIC_IMPORT.test(text.split(/\r?\n/)[line - 1] ?? '');
}

export function withoutFollowedImports(findings, conventions = {}, readSource = () => undefined) {
  const allowAll = conventions[JAVA_WILDCARD_IMPORTS] === 'wildcard';
  const allowStaticInTests = conventions[JAVA_TEST_STATIC_IMPORTS] === 'wildcard';
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
