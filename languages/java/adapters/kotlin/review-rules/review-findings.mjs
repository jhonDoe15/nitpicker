import { hasAwaitility } from '../../../messages/wait-advice.mjs';
import { swallowedHandlerFindings } from './handlers/swallowed-handlers.mjs';
import { blockingFindings } from './blocking/blocking-findings.mjs';
import { enumPredicateFindings } from './main/enum-predicates.mjs';
import { fanOutFindings } from './main/fan-out/fan-out.mjs';
import { forwardingWrapperFindings } from './main/forwarding/forwarding-wrappers.mjs';
import { methodAliasFindings } from './main/forwarding/method-aliases.mjs';
import { generatedMemberFindings } from './main/generated-members/generated-members.mjs';
import { loadEffectFindings } from './main/load-effects.mjs';
import { fieldLockingFindings } from './main/locking/field-locking.mjs';
import { lockOrderFindings } from './main/locking/lock-order.mjs';
import { reusableObjectFindings } from './main/reusable-objects/reusable-objects.mjs';
import { singularPluralFindings } from './main/member-names.mjs';
import { timeoutFindings } from './main/timeouts/timeouts.mjs';
import { streamedRowsFindings } from './main/streamed-rows/streamed-rows.mjs';
import { suspendedUpdateFindings } from './main/suspension/suspended-updates.mjs';
import { recursiveMapUpdateFindings } from './main/map-updates/recursive-map-update.mjs';
import { serviceLookupFindings } from './main/service-lookups/service-lookups.mjs';
import { unboundedPoolFindings } from './main/thread-pools/unbounded-pools.mjs';
import { unusedOptionFindings } from './main/unused-options/unused-options.mjs';
import { kotlinDesignFindings } from './design/kotlin-design.mjs';
import { validationTargetFindings } from './validation/validation-targets.mjs';
import { buildViews, javaMentions } from './build-view.mjs';
import { childLifetimeFindings } from './coroutines/resource-lifetime.mjs';
import { suspendCleanupFindings } from './coroutines/suspend-cleanup.mjs';
import { productionTypeResolver } from './production-types.mjs';
import { findingFactory } from './review-finding.mjs';
import { springFindings } from './spring/spring-findings.mjs';
import { relaxedMockFindings } from './tests/mocks/relaxed-mocks.mjs';
import { subjectMockFindings } from './tests/mocks/subject-mocks.mjs';
import { springContextFindings } from './tests/spring-context.mjs';
import { testHonestyFindings } from './tests/test-honesty.mjs';
import { testWaitFindings } from './tests/test-waits.mjs';

function projectView(context) {
  const { reportRoot, projectRoot, manifest, modules = [] } = context;
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
  return { own, projectFiles, javaRoots, projectRoot, build };
}

function contextRoots(manifest, modules) {
  return [manifest, ...modules.map((module) => module.manifest)].flatMap((entry) => [
    ...(entry?.kotlinSourceRoots ?? []),
    ...(entry?.kotlinTestSourceRoots ?? []),
  ]);
}

export function readKotlinFanOutFindings(context) {
  const { own, projectFiles, javaRoots, projectRoot } = projectView(context);
  return fanOutFindings({ own, projectFiles, projectRoot, javaRoots });
}

function honestyFindings({ manifest, projectRoot, modules = [] }, finding) {
  return testHonestyFindings({
    projectRoot,
    testRoots: manifest.kotlinTestSourceRoots,
    contextRoots: contextRoots(manifest, modules),
    finding,
  });
}

export function readKotlinReviewFindings(context) {
  const { manifest, projectRoot, reportRoot } = context;
  const { own, projectFiles, javaRoots, build } = projectView(context);
  const finding = findingFactory();
  const honesty = honestyFindings(context, finding);
  if (own.length === 0) {
    return honesty;
  }
  const isProduction = productionTypeResolver({ files: projectFiles, projectRoot, javaRoots });
  return [
    ...testWaitFindings(own, {
      finding,
      awaitility: hasAwaitility({ manifest, projectRoot }),
      isProduction,
      declaredIn: projectFiles,
    }),
    ...honesty,
    ...subjectMockFindings(own, { finding, projectRoot, projectFiles, isProduction }),
    ...relaxedMockFindings(own, { finding, projectRoot, isProduction }),
    ...springContextFindings(own, { finding }),
    ...springFindings(own, { finding, manifest, projectFiles, projectRoot, javaRoots }),
    ...blockingFindings(own, { finding, declaredIn: projectFiles, projectRoot, javaRoots }),
    ...enumPredicateFindings(own, { finding, projectRoot, declaredIn: projectFiles }),
    ...forwardingWrapperFindings(own, { finding, declaredIn: projectFiles }),
    ...methodAliasFindings(own, { finding }),
    ...singularPluralFindings(own, { finding }),
    ...timeoutFindings(own, { finding }),
    ...suspendedUpdateFindings(own, { finding, declaredIn: projectFiles }),
    ...swallowedHandlerFindings(own, { finding, declaredIn: projectFiles }),
    ...lockOrderFindings(own, { finding, declaredIn: projectFiles }),
    ...fieldLockingFindings(own, { finding, declaredIn: projectFiles }),
    ...suspendCleanupFindings(own, { finding, declaredIn: projectFiles }),
    ...childLifetimeFindings(own, { finding }),
    ...serviceLookupFindings(own, { finding, declaredIn: projectFiles }),
    ...validationTargetFindings(own, { finding }),
    ...loadEffectFindings(own, { finding, declaredIn: projectFiles }),
    ...unboundedPoolFindings(own, { finding }),
    ...recursiveMapUpdateFindings(own, { finding, declaredIn: projectFiles }),
    ...streamedRowsFindings(own, { finding, declaredIn: projectFiles }),
    ...reusableObjectFindings(own, { finding, declaredIn: projectFiles }),
    ...kotlinDesignFindings(reportRoot, { environment: context.environment }),
    ...generatedMemberFindings(own, { finding, declaredIn: projectFiles }),
    ...unusedOptionFindings(own, {
      finding,
      build,
      reportRoot,
      serialization: manifest.kotlinSerialization === true,
      mentionedInJava: javaMentions(projectRoot, [manifest]),
    }),
  ];
}
