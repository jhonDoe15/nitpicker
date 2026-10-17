import { readFileSync } from 'node:fs';
import { pathInside, sourceFilesUnder } from '../../review-rules/java-sources.mjs';
import { enumPredicateFindings } from './main/enum-predicates.mjs';
import { forwardingWrapperFindings } from './main/forwarding-wrappers.mjs';
import { singularPluralFindings } from './main/member-names.mjs';
import { unusedOptionFindings } from './main/unused-options.mjs';
import { readKotlinFacts } from './kotlin-facts.mjs';
import { productionTypeResolver } from './production-types.mjs';
import { findingFactory } from './review-finding.mjs';
import { springContextFindings } from './tests/spring-context.mjs';
import { testWaitFindings } from './tests/test-waits.mjs';

function javaSourceText(projectRoot, manifest) {
  const roots = [...(manifest.sourceRoots ?? []), ...(manifest.testSourceRoots ?? [])];
  return roots
    .flatMap((root) => sourceFilesUnder(pathInside(projectRoot, root), ['.java']))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
}

function javaMentions(projectRoot, manifest) {
  let text;
  return (name) => {
    text ??= javaSourceText(projectRoot, manifest);
    return new RegExp(String.raw`\b${name}\b`, 'u').test(text);
  };
}

export function readKotlinReviewFindings({ reportRoot, projectRoot, manifest }) {
  const { files } = readKotlinFacts(reportRoot);
  if (files.length === 0) {
    return [];
  }
  const finding = findingFactory();
  const javaRoots = manifest.sourceRoots ?? [];
  return [
    ...testWaitFindings(files, {
      finding,
      isProduction: productionTypeResolver({ files, projectRoot, javaRoots }),
    }),
    ...springContextFindings(files, { finding }),
    ...enumPredicateFindings(files, { finding, projectRoot }),
    ...forwardingWrapperFindings(files, { finding }),
    ...singularPluralFindings(files, { finding }),
    ...unusedOptionFindings(files, {
      finding,
      mentionedInJava: javaMentions(projectRoot, manifest),
    }),
  ];
}
