import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compareFindings } from '../../../core/diff/comparison/compare.mjs';
import { skippedTools } from '../../../core/diff/comparison/results.mjs';
import { parseAnalyzerReport } from '../../../core/diff/comparison/finding-schema.mjs';
import { captureWorkingTree, resolveComparison } from '../../../core/diff/git/repository/git.mjs';
import { readChangedLines } from '../../../core/diff/git/patches/changed-lines.mjs';
import { readProjectMoves } from '../../../core/diff/git/patches/project-moves.mjs';
import { withTemporaryWorktree } from '../../../core/diff/git/repository/worktree.mjs';
import { runJavaDuplicates } from './metrics/java-duplicates.mjs';
import { runKotlinDuplicates } from './kotlin/kotlin-duplicates.mjs';
import { applyFindingPolicy } from '../../../shared/findings/finding-policy.mjs';
import { withoutFollowedImports } from './imports/followed-imports.mjs';
import { withoutGeneratedSources } from './generated/generated-sources.mjs';
import { withoutOverlaps } from './overlaps/static-overlaps.mjs';
import { toolConfigChoices } from './tool-config/tool-config-choices.mjs';
import { runJavaPreset } from './gradle-wrapper/gradle-preset.mjs';
import { javaFindingOptions } from './reporting/finding-options.mjs';
import { readJavaFindings } from './reporting/java-reports.mjs';
import { readReportModules } from './gradle-reports/report-modules.mjs';
import { runMavenPreset, MAVEN_REPORT_DIRECTORY } from '../maven/maven-build.mjs';
import { detectJavaBuild } from '../builds/java-build.mjs';
import { moduleReport, readModuleFindings } from '../builds/java-modules.mjs';
import { resolveKotlinRun } from './kotlin/kotlin-run.mjs';
import { isJavaTouchedRule } from './touched-rules.mjs';
import { withProjectEnumPredicates } from './review-rules/enum-predicates.mjs';

function withoutReportBase(error, reportBase) {
  return error instanceof Error && error.message.includes(reportBase)
    ? new Error(error.message.replaceAll(reportBase, '<report directory>'), { cause: error })
    : error;
}

function gradleFindings(projectRoot, options, reportBase) {
  const preset = options.policy?.preset ?? 'java';
  const kotlinRun = resolveKotlinRun(projectRoot, options.policy);
  runJavaPreset(projectRoot, { ...options, reportBase, kotlinRun });
  const report = readReportModules(reportBase, preset);
  const duplicates = {
    reportRoot: reportBase,
    manifest: report.manifest,
    skippedFolders: options.policy?.duplicateSkippedFolders,
  };
  runJavaDuplicates(projectRoot, duplicates);
  if (preset === 'kotlin') {
    runKotlinDuplicates(projectRoot, duplicates);
  }
  return readJavaFindings(projectRoot, {
    ...javaFindingOptions(options.policy),
    formatAdvice: kotlinRun?.advice,
    reportBase,
    report,
  }).findings;
}

function withGradleReports(projectRoot, options) {
  const reportBase =
    options.reportDirectory ?? mkdtempSync(path.join(tmpdir(), 'nitpicker-java-reports-'));
  try {
    return gradleFindings(projectRoot, options, reportBase);
  } catch (error) {
    throw withoutReportBase(error, reportBase);
  } finally {
    if (options.reportDirectory === undefined) {
      rmSync(reportBase, { recursive: true, force: true });
    }
  }
}

function mavenFindings(projectRoot, options) {
  const moduleDirs = runMavenPreset(projectRoot, {
    maven: options.maven,
    policy: options.policy,
    configs: toolConfigChoices(projectRoot, options.policy),
  });
  for (const moduleDir of moduleDirs) {
    const { reportBase, report } = moduleReport(moduleDir, MAVEN_REPORT_DIRECTORY);
    runJavaDuplicates(moduleDir, {
      reportRoot: reportBase,
      manifest: report.manifest,
      skippedFolders: options.policy?.duplicateSkippedFolders,
    });
  }
  return readModuleFindings(projectRoot, moduleDirs, {
    ...javaFindingOptions(options.policy),
    reportDirectory: MAVEN_REPORT_DIRECTORY,
  });
}

export function collectJavaFindings(root, options = {}) {
  const projectRoot = path.resolve(root);
  const findings =
    detectJavaBuild(projectRoot) === 'maven'
      ? mavenFindings(projectRoot, options)
      : withGradleReports(projectRoot, options);
  const preset = options.policy?.preset ?? 'java';
  function readSource(file) {
    return sourceText(projectRoot, file);
  }
  return applyFindingPolicy(
    withoutFollowedImports(
      withProjectEnumPredicates(
        withoutGeneratedSources(parseAnalyzerReport({ findings }, preset).findings, projectRoot),
        projectRoot,
      ),
      options.policy?.conventions,
      readSource,
    ),
    { ...options.policy, inventoryTool: preset },
    (reported) => withoutOverlaps(reported, { readSource }),
  );
}

function sourceText(projectRoot, file) {
  const absolute = path.join(projectRoot, file);
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : undefined;
}

function compareAcrossMoves({ repositoryRoot, comparison, projectRelativePath }, findings) {
  const commits = {
    repositoryRoot,
    mergeBaseSha: comparison.mergeBaseSha,
    headSha: comparison.headSha,
    projectRelativePath,
  };
  return compareFindings({
    ...findings,
    baseToHeadRenames: readProjectMoves(commits).files,
    touchedCode: { changedLines: readChangedLines(commits), isStrictRule: isJavaTouchedRule },
  });
}

function withoutSkipped(findings, skipped) {
  return findings.filter(
    (finding) => finding.classification === 'tool-error' || !skipped.has(finding.tool),
  );
}

function collectBothSnapshots({
  repositoryRoot,
  projectRelativePath,
  comparison,
  options,
  policy,
}) {
  return withTemporaryWorktree(repositoryRoot, comparison.headSha, (headWorktree) => {
    const policyRoot = path.join(headWorktree, projectRelativePath);
    function collectIn(worktreeRoot, snapshot) {
      return collectJavaFindings(path.join(worktreeRoot, projectRelativePath), {
        ...options,
        policy: { ...policy, snapshot, policyRoot },
      });
    }
    return withTemporaryWorktree(repositoryRoot, comparison.mergeBaseSha, (baseWorktree) => {
      const baseFindings = collectIn(baseWorktree, 'base');
      const headFindings = collectJavaFindings(policyRoot, {
        ...options,
        policy: {
          ...policy,
          snapshot: 'head',
          policyRoot,
          baselineRoot: path.join(baseWorktree, projectRelativePath),
        },
      });
      return { baseFindings, headFindings };
    });
  });
}

export function runJavaDiff({
  repositoryRoot,
  projectRelativePath = '.',
  requestedBaseRef,
  includeWorkingTree = false,
  gradle,
  maven,
  initScript,
  policy,
}) {
  const committed = resolveComparison(repositoryRoot, requestedBaseRef);
  const comparison = includeWorkingTree
    ? { ...committed, headSha: captureWorkingTree(repositoryRoot, committed.headSha) }
    : committed;
  const { baseFindings, headFindings } = collectBothSnapshots({
    repositoryRoot,
    projectRelativePath,
    comparison,
    options: { gradle, maven, initScript },
    policy,
  });
  const sides = [baseFindings, headFindings].map((findings) => ({ findings }));
  const skipped = skippedTools(policy?.preset ?? 'java', sides);
  const result = compareAcrossMoves(
    { repositoryRoot, comparison, projectRelativePath },
    {
      baseFindings: withoutSkipped(baseFindings, skipped),
      headFindings: withoutSkipped(headFindings, skipped),
    },
  );
  const newEnforceable = result.newFindings.filter(
    (finding) => finding.classification === 'enforceable',
  );
  const failed =
    newEnforceable.length > 0 ||
    result.newFindings.some((finding) => finding.classification === 'tool-error');
  return { comparison, ...result, newEnforceable, failed };
}
