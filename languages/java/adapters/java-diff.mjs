import path from 'node:path';
import {
  testFailuresOf,
  unknownOnBaseFor,
} from '../../../core/diff/comparison/base-red/unknown-base.mjs';
import { compareFindings } from '../../../core/diff/comparison/compare.mjs';
import { parseAnalyzerReportKeepingValid } from '../../../core/diff/comparison/schema/invalid-findings.mjs';
import { captureWorkingTree, resolveComparison } from '../../../core/diff/git/repository/git.mjs';
import { readChangedLines } from '../../../core/diff/git/patches/changed-lines.mjs';
import { readRemovesTests } from '../../../core/diff/git/patches/test-removal.mjs';
import { readRenameMap } from '../../../core/diff/git/patches/project-moves.mjs';
import { withTemporaryWorktree } from '../../../core/diff/git/repository/worktree.mjs';
import { runJavaDuplicates } from './metrics/java-duplicates.mjs';
import { runKotlinDuplicates } from './kotlin/kotlin-duplicates.mjs';
import { applyFindingPolicy } from '../../../shared/findings/finding-policy.mjs';
import { javaRouteRule } from './java-policy.mjs';
import { withoutFollowedImports } from './imports/followed-imports.mjs';
import { withoutGeneratedSources } from './generated/generated-sources.mjs';
import { withoutOverlaps } from './overlaps/static-overlaps.mjs';
import { readOptions } from './options/java-read-options.mjs';
import { toolConfigChoices } from './tool-config/tool-config-choices.mjs';
import { withJavaColumns } from './reporting/columns/java-columns.mjs';
import { sourceTextReader } from './reporting/function-locator.mjs';
import { lintBaselineProperties, withGradleReports } from './reporting/gradle-run.mjs';
import { runMavenPreset } from '../maven/maven-build.mjs';
import { MAVEN_REPORT_DIRECTORY } from '../maven/module/maven-module.mjs';
import { detectJavaBuild } from '../builds/java-build.mjs';
import { mergedRoots, readModuleReport } from '../builds/java-modules.mjs';
import { withTestsFailures } from './red-base/tests-failed.mjs';
import { isJavaTouchedRule } from './touched-rules.mjs';
import { withProjectSourceRules } from './regexes/regex-defects.mjs';
import { mavenDesignFindings } from './design/design-modules.mjs';
import { mutationPlanOf } from '../builds/change-scope/mutation-plan.mjs';
import {
  notAffectedFindings,
  withChangedFiles,
} from '../builds/change-scope/affected/changed-files.mjs';

export { lintBaselineProperties };

function mavenFindings(projectRoot, options) {
  const { moduleDirs, testsFailures, formatAdvice, notAffected } = runMavenPreset(projectRoot, {
    ...options,
    timeoutMs: options.budget?.mavenCommandTimeoutMs,
    pitDeadline: options.budget?.pitDeadlineMs,
    configs: toolConfigChoices(projectRoot, options.policy),
  });
  const duplicates = {
    reportRoot: path.join(projectRoot, MAVEN_REPORT_DIRECTORY),
    manifest: mergedRoots(projectRoot, moduleDirs, MAVEN_REPORT_DIRECTORY),
    skippedFolders: options.policy?.duplicateSkippedFolders,
  };
  runJavaDuplicates(projectRoot, duplicates);
  if (options.policy?.preset === 'kotlin') {
    runKotlinDuplicates(projectRoot, duplicates);
  }
  const { findings, imports } = readModuleReport(projectRoot, moduleDirs, {
    ...readOptions(options.policy),
    formatAdvice,
    reportDirectory: MAVEN_REPORT_DIRECTORY,
  });
  return {
    findings: [...findings, ...mavenDesignFindings(projectRoot, moduleDirs, options.policy)],
    imports,
    testsFailures,
    notAffected,
  };
}

export function collectJavaFindings(root, options = {}) {
  return collectJavaReport(root, options).findings;
}

export function collectJavaReport(root, options = {}) {
  const projectRoot = path.resolve(root);
  const plan = mutationPlanOf(projectRoot, withChangedFiles(options, projectRoot));
  const {
    findings: collected,
    imports,
    testsFailures,
    notAffected,
  } = detectJavaBuild(projectRoot, options.policy?.buildTool) === 'maven'
    ? mavenFindings(projectRoot, plan.options)
    : withGradleReports(projectRoot, plan.options);
  const findings = [
    ...plan.findings(collected),
    ...notAffectedFindings(notAffected, options.policy),
  ];
  const preset = options.policy?.preset ?? 'java';
  const readSource = sourceTextReader(projectRoot);
  const columns = withJavaColumns(findings, { projectRoot, policy: options.policy, readSource });
  const parsed = parseAnalyzerReportKeepingValid({ findings: columns }, preset).findings;
  const policed = applyFindingPolicy(
    withoutFollowedImports(
      withProjectSourceRules(withoutGeneratedSources(parsed, projectRoot), projectRoot),
      options.policy?.conventions,
      readSource,
    ),
    { ...options.policy, inventoryTool: preset, routeRule: javaRouteRule },
    options.resolveOverlaps ?? ((reported) => withoutOverlaps(reported, { readSource })),
  );
  const snapshot = options.policy?.snapshot === 'base' ? 'base' : 'head';
  return {
    findings: withTestsFailures(policed, { preset, failures: testsFailures, snapshot }),
    imports,
  };
}

function collectBothSnapshots({
  repositoryRoot,
  projectRelativePath,
  comparison,
  options,
  policy,
  warn,
}) {
  const head = { commitSha: comparison.headSha, warn };
  return withTemporaryWorktree(repositoryRoot, head, (headWorktree) => {
    const policyRoot = path.join(headWorktree, projectRelativePath);
    function collectIn(worktreeRoot, snapshot, extra = {}) {
      return collectJavaFindings(path.join(worktreeRoot, projectRelativePath), {
        ...options,
        policy: { ...policy, snapshot, policyRoot, ...extra },
      });
    }
    return withTemporaryWorktree(
      repositoryRoot,
      { commitSha: comparison.mergeBaseSha, warn },
      (baseWorktree) => {
        const collectedBase = collectIn(baseWorktree, 'base');
        const headFindings = collectIn(headWorktree, 'head', {
          baselineRoot: path.join(baseWorktree, projectRelativePath),
        });
        const notes = testFailuresOf({ findings: collectedBase });
        return {
          notes,
          baseFindings: collectedBase.filter((finding) => !notes.includes(finding)),
          headFindings,
        };
      },
    );
  });
}

function withEnforceable(outcome) {
  const newEnforceable = outcome.newFindings.filter(
    (finding) => finding.classification === 'enforceable',
  );
  const failed =
    newEnforceable.length > 0 ||
    outcome.newFindings.some((finding) => finding.classification === 'tool-error');
  return { ...outcome, newEnforceable, failed };
}

export function runJavaDiff({
  repositoryRoot,
  projectRelativePath = '.',
  requestedBaseRef,
  includeWorkingTree = false,
  gradle,
  maven,
  spawn,
  initScript,
  policy,
}) {
  const committed = resolveComparison(repositoryRoot, requestedBaseRef);
  const comparison = includeWorkingTree
    ? { ...committed, headSha: captureWorkingTree(repositoryRoot, committed.headSha) }
    : committed;
  const range = {
    repositoryRoot,
    mergeBaseSha: comparison.mergeBaseSha,
    headSha: comparison.headSha,
    projectRelativePath,
  };
  const baseToHeadRenames = readRenameMap(range);
  const warnings = [];
  const { notes, baseFindings, headFindings } = collectBothSnapshots({
    repositoryRoot,
    projectRelativePath,
    comparison,
    options: { gradle, maven, spawn, initScript },
    policy,
    warn: (message) => warnings.push(message),
  });
  const touchedCode = {
    changedLines: readChangedLines(range),
    isStrictRule: isJavaTouchedRule,
    testsRemoved: readRemovesTests(range),
  };
  const result = compareFindings({
    baseFindings,
    headFindings,
    baseToHeadRenames,
    touchedCode,
    unknownOnBase: unknownOnBaseFor(notes, touchedCode),
  });
  return withEnforceable({ comparison, ...result, notes, warnings });
}
