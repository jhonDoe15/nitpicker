import type { Finding } from '../../../../../shared/values/findings.mts';
import type { KotlinFile } from './typed/kotlin-fact-types.mts';
import type { FindingFactory, RuleOptions } from './typed/review-finding-types.mts';
import type {
  FactsView,
  ReviewContext,
  ReviewManifest,
  ReviewModule,
} from './typed/review-context-types.mts';
import { hasAwaitility } from '../../../messages/wait-advice.mts';
import { swallowedHandlerFindings } from './handlers/swallowed-handlers.mts';
import { blockingFindings } from './blocking/blocking-findings.mts';
import { enumPredicateFindings } from './main/enum-predicates.mts';
import { fanOutFindings } from './main/fan-out/fan-out.mts';
import type { FanOutResult } from './main/fan-out/typed/fan-out-types.mts';
import { forwardingWrapperFindings } from './main/forwarding/forwarding-wrappers.mts';
import { methodAliasFindings } from './main/forwarding/method-aliases.mts';
import { generatedMemberFindings } from './main/generated-members/generated-members.mts';
import { loadEffectFindings } from './main/load-effects.mts';
import { fieldLockingFindings } from './main/locking/field-locking.mts';
import { lockOrderFindings } from './main/locking/lock-order.mts';
import { reusableObjectFindings } from './main/reusable-objects/reusable-objects.mts';
import { singularPluralFindings } from './main/member-names.mts';
import { timeoutFindings } from './main/timeouts/timeouts.mts';
import { streamedRowsFindings } from './main/streamed-rows/streamed-rows.mts';
import { suspendedUpdateFindings } from './main/suspension/suspended-updates.mts';
import { recursiveMapUpdateFindings } from './main/map-updates/recursive-map-update.mts';
import { serviceLookupFindings } from './main/service-lookups/service-lookups.mts';
import { unboundedPoolFindings } from './main/thread-pools/unbounded-pools.mts';
import { unusedOptionFindings } from './main/unused-options/unused-options.mts';
import { kotlinDesignFindings } from './design/kotlin-design.mts';
import { validationTargetFindings } from './validation/validation-targets.mts';
import { buildViews, javaMentions } from './build-view.mts';
import { childLifetimeFindings } from './coroutines/resource-lifetime.mts';
import { suspendCleanupFindings } from './coroutines/suspend-cleanup.mts';
import { productionTypeResolver } from './production-types.mts';
import { findingFactory } from './review-finding.mts';
import { springFindings } from './spring/spring-findings.mts';
import { relaxedMockFindings } from './tests/mocks/relaxed-mocks.mts';
import { subjectMockFindings } from './tests/mocks/subject-mocks.mts';
import { springContextFindings } from './tests/spring-context.mts';
import { testHonestyFindings } from './tests/test-honesty.mts';
import { testWaitFindings } from './tests/test-waits.mts';

type ProjectView = {
  own: KotlinFile[];
  projectFiles: KotlinFile[];
  javaRoots: string[];
  projectRoot: string;
  build: FactsView;
};

function filesOf(build: FactsView, reportRoot: string): KotlinFile[] {
  const facts = build.facts.get(reportRoot);
  if (facts === undefined) {
    throw new TypeError(`no Kotlin facts were read for ${reportRoot}`);
  }
  return facts.files;
}

function projectView(context: ReviewContext): ProjectView {
  const { reportRoot, projectRoot, manifest, modules = [] } = context;
  const build = (context.buildViews ?? buildViews())(context);
  const own = filesOf(build, reportRoot);
  const siblings = modules.filter((module) => module.reportRoot !== reportRoot);
  const projectFiles = [...own, ...siblings.flatMap((module) => filesOf(build, module.reportRoot))];
  const javaRoots = [
    ...new Set(
      [manifest, ...siblings.map((module) => module.manifest)].flatMap(
        (entry) => entry?.sourceRoots ?? [],
      ),
    ),
  ];
  return { own, projectFiles, javaRoots, projectRoot, build };
}

function contextRoots(manifest: ReviewManifest, modules: ReviewModule[]): string[] {
  return [manifest, ...modules.map((module) => module.manifest)].flatMap((entry) => [
    ...(entry?.kotlinSourceRoots ?? []),
    ...(entry?.kotlinTestSourceRoots ?? []),
  ]);
}

export function readKotlinFanOutFindings(context: ReviewContext): FanOutResult {
  const { own, projectFiles, javaRoots, projectRoot } = projectView(context);
  return fanOutFindings({ own, projectFiles, projectRoot, javaRoots });
}

function honestyFindings(
  { manifest, projectRoot, modules = [], assertionHelpers }: ReviewContext,
  finding: FindingFactory,
): Finding[] {
  return testHonestyFindings({
    projectRoot,
    assertionNames: assertionHelpers ?? [],
    testRoots: manifest.kotlinTestSourceRoots ?? [],
    contextRoots: contextRoots(manifest, modules),
    finding,
  });
}

const COLLECTION_RULES: ((files: KotlinFile[], options: Required<RuleOptions>) => Finding[])[] = [
  recursiveMapUpdateFindings,
  streamedRowsFindings,
  reusableObjectFindings,
];

export function readKotlinReviewFindings(context: ReviewContext): Finding[] {
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
    ...springFindings(own, { ...context, finding, projectFiles, javaRoots }),
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
    ...COLLECTION_RULES.flatMap((rule) => rule(own, { finding, declaredIn: projectFiles })),
    ...kotlinDesignFindings(reportRoot, { environment: context.environment }),
    ...generatedMemberFindings(own, { finding, declaredIn: projectFiles }),
    ...unusedOptionFindings(own, {
      finding,
      build,
      reportRoot,
      serialization: manifest['kotlinSerialization'] === true,
      mentionedInJava: javaMentions(projectRoot, [manifest]),
    }),
  ];
}
