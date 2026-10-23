import { readFileSync } from 'node:fs';
import { hasAwaitility } from '../../../messages/wait-advice.mjs';
import { pathInside, sourceFilesUnder } from '../../review-rules/java-sources.mjs';
import { enumPredicateFindings } from './main/enum-predicates.mjs';
import { forwardingWrapperFindings } from './main/forwarding-wrappers.mjs';
import { singularPluralFindings } from './main/member-names.mjs';
import { unusedOptionFindings } from './main/unused-options.mjs';
import { readKotlinFacts } from './kotlin-facts.mjs';
import { productionTypeResolver } from './production-types.mjs';
import { findingFactory } from './review-finding.mjs';
import { springFindings } from './spring/spring-findings.mjs';
import { springContextFindings } from './tests/spring-context.mjs';
import { testWaitFindings } from './tests/test-waits.mjs';

const IDENTIFIER = /[\p{L}_$][\p{L}\p{N}_$]*/gu;

function javaSourceText(projectRoot, manifests) {
  const roots = new Set(
    manifests.flatMap((manifest) => [
      ...(manifest.sourceRoots ?? []),
      ...(manifest.testSourceRoots ?? []),
    ]),
  );
  return [...roots]
    .flatMap((root) => sourceFilesUnder(pathInside(projectRoot, root), ['.java']))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
}

function javaMentions(projectRoot, manifests) {
  let identifiers;
  return (name) => {
    identifiers ??= new Set(javaSourceText(projectRoot, manifests).match(IDENTIFIER));
    return identifiers.has(name);
  };
}

function projectView({ reportRoot, manifest, modules = [] }) {
  const own = readKotlinFacts(reportRoot).files;
  const siblings = modules.filter((module) => module.reportRoot !== reportRoot);
  const projectFiles = [
    ...own,
    ...siblings.flatMap((module) => readKotlinFacts(module.reportRoot).files),
  ];
  const javaRoots = [
    ...new Set(
      [manifest, ...siblings.map((module) => module.manifest)].flatMap(
        (entry) => entry.sourceRoots ?? [],
      ),
    ),
  ];
  const manifests = [manifest, ...siblings.map((module) => module.manifest)];
  return { own, projectFiles, javaRoots, manifests };
}

export function readKotlinReviewFindings(context) {
  const { manifest, projectRoot } = context;
  const { own, projectFiles, javaRoots, manifests } = projectView(context);
  if (own.length === 0) {
    return [];
  }
  const finding = findingFactory();
  return [
    ...testWaitFindings(own, {
      finding,
      awaitility: hasAwaitility({ manifest, projectRoot }),
      isProduction: productionTypeResolver({ files: projectFiles, projectRoot, javaRoots }),
    }),
    ...springContextFindings(own, { finding }),
    ...springFindings(own, { finding, manifest, projectFiles, projectRoot, javaRoots }),
    ...enumPredicateFindings(own, { finding, projectRoot, declaredIn: projectFiles }),
    ...forwardingWrapperFindings(own, { finding, declaredIn: projectFiles }),
    ...singularPluralFindings(own, { finding }),
    ...unusedOptionFindings(own, {
      finding,
      projectFiles,
      published: manifest.published === true,
      serialization: manifest.kotlinSerialization === true,
      mentionedInJava: javaMentions(projectRoot, manifests),
    }),
  ];
}
