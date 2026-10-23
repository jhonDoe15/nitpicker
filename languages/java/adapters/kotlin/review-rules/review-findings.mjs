import { hasAwaitility } from '../../../messages/wait-advice.mjs';
import { enumPredicateFindings } from './main/enum-predicates.mjs';
import { forwardingWrapperFindings } from './main/forwarding-wrappers.mjs';
import { singularPluralFindings } from './main/member-names.mjs';
import { unusedOptionFindings } from './main/unused-options.mjs';
import { buildViews, javaMentions } from './build-view.mjs';
import { productionTypeResolver } from './production-types.mjs';
import { findingFactory } from './review-finding.mjs';
import { springFindings } from './spring/spring-findings.mjs';
import { springContextFindings } from './tests/spring-context.mjs';
import { testHonestyFindings } from './tests/test-honesty.mjs';
import { testWaitFindings } from './tests/test-waits.mjs';

function projectView(context) {
  const { reportRoot, manifest, modules = [] } = context;
  const build = (context.buildViews ?? buildViews())(context);
  const own = build.facts.get(reportRoot).files;
  const siblings = modules.filter((module) => module.reportRoot !== reportRoot);
  const projectFiles = [
    ...own,
    ...siblings.flatMap((module) => build.facts.get(module.reportRoot).files),
  ];
  const javaRoots = [
    ...new Set(
      [manifest, ...siblings.map((module) => module.manifest)].flatMap(
        (entry) => entry.sourceRoots ?? [],
      ),
    ),
  ];
  return { own, projectFiles, javaRoots, build };
}

function contextRoots(manifest, modules) {
  return [manifest, ...modules.map((module) => module.manifest)].flatMap((entry) => [
    ...(entry?.kotlinSourceRoots ?? []),
    ...(entry?.kotlinTestSourceRoots ?? []),
  ]);
}

export function readKotlinReviewFindings(context) {
  const { manifest, projectRoot, modules = [] } = context;
  const { own, projectFiles, javaRoots, build } = projectView(context);
  const finding = findingFactory();
  const honesty = testHonestyFindings({
    projectRoot,
    testRoots: manifest.kotlinTestSourceRoots,
    contextRoots: contextRoots(manifest, modules),
    finding,
  });
  if (own.length === 0) {
    return honesty;
  }
  return [
    ...testWaitFindings(own, {
      finding,
      awaitility: hasAwaitility({ manifest, projectRoot }),
      isProduction: productionTypeResolver({ files: projectFiles, projectRoot, javaRoots }),
    }),
    ...honesty,
    ...springContextFindings(own, { finding }),
    ...springFindings(own, { finding, manifest, projectFiles, projectRoot, javaRoots }),
    ...enumPredicateFindings(own, { finding, projectRoot, declaredIn: projectFiles }),
    ...forwardingWrapperFindings(own, { finding, declaredIn: projectFiles }),
    ...singularPluralFindings(own, { finding }),
    ...unusedOptionFindings(own, {
      finding,
      build,
      published: manifest.published === true,
      serialization: manifest.kotlinSerialization === true,
      mentionedInJava: javaMentions(projectRoot, [manifest]),
    }),
  ];
}
