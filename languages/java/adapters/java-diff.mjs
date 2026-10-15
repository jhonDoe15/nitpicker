import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { compareFindings } from '../../../core/diff/compare.mjs';
import { parseAnalyzerReport } from '../../../core/diff/finding-schema.mjs';
import {
  captureWorkingTree,
  readChangedLines,
  readRenameMap,
  resolveComparison,
} from '../../../core/diff/git.mjs';
import { withTemporaryWorktree } from '../../../core/diff/worktree.mjs';
import { gradleTarget } from './gradle-wrapper/gradle-command.mjs';
import { runJavaDuplicates } from './java-duplicates.mjs';
import { runKotlinDuplicates } from './kotlin-duplicates.mjs';
import { applyJavaPolicy } from './java-policy.mjs';
import { PROJECT_TOOL_CONFIGS } from './gradle-presets.mjs';
import { REPORT_DIRECTORY, requireGradleReports } from './java-reports.mjs';
import { detectJavaBuild, MAVEN_REPORT_DIRECTORY, runMavenPreset } from '../maven/maven-build.mjs';
import { readModuleFindings } from '../multi-module/java-modules.mjs';
import { kotlinGradleArguments } from './kotlin-tools.mjs';
import { isJavaTouchedRule } from './touched-rules.mjs';

export const INIT_SCRIPT = path.resolve(import.meta.dirname, '../gradle/nitpicker.init.gradle');
const GRADLE_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;

function kotlinProperties(projectRoot, { preset, kotlinFormatter, kotlinDetektConfig, snapshot }) {
  return preset === 'kotlin'
    ? kotlinGradleArguments(projectRoot, {
        formatter: kotlinFormatter,
        detektConfig: kotlinDetektConfig,
        snapshot,
      })
    : [];
}

export function toolConfigChoices(projectRoot, { toolPrecedence = {}, policyRoot } = {}) {
  return Object.fromEntries(
    [...PROJECT_TOOL_CONFIGS].map(([tool, file]) => {
      const precedence = toolPrecedence[tool] ?? ['nitpicker'];
      const projectConfig = path.join(policyRoot ?? projectRoot, file);
      if (precedence.includes('project') && !existsSync(projectConfig)) {
        throw new Error(`"tools.${tool}.precedence" lists "project" but ${file} is missing`);
      }
      return [
        tool,
        {
          nitpicker: precedence.includes('nitpicker'),
          project: precedence.includes('project') ? projectConfig : undefined,
        },
      ];
    }),
  );
}

export function toolConfigProperties(projectRoot, policy = {}) {
  return Object.entries(toolConfigChoices(projectRoot, policy)).flatMap(([tool, choice]) => [
    ...(choice.project === undefined
      ? []
      : [`-Pnitpicker.${tool}.projectConfig=${choice.project}`]),
    ...(choice.nitpicker ? [] : [`-Pnitpicker.${tool}.nitpickerConfig=false`]),
  ]);
}

function runJavaPreset(projectRoot, { gradle, initScript = INIT_SCRIPT, policy = {} } = {}) {
  const target = gradleTarget({
    projectRoot,
    configured: gradle,
    args: [
      '--console=plain',
      '--quiet',
      '--no-configuration-cache',
      ...kotlinProperties(projectRoot, policy),
      ...toolConfigProperties(projectRoot, policy),
      '-I',
      initScript,
      'nitpickerJava',
    ],
  });
  const result = spawnSync(target.command, target.args, {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    shell: target.shell,
    timeout: GRADLE_TIMEOUT_MS,
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || 'no diagnostic output';
    throw new Error(`Java preset failed in ${projectRoot}: ${detail}`);
  }
}

function buildModules(projectRoot, options) {
  if (detectJavaBuild(projectRoot) === 'maven') {
    const moduleDirs = runMavenPreset(projectRoot, {
      maven: options.maven,
      policy: options.policy,
      configs: toolConfigChoices(projectRoot, options.policy),
    });
    return { moduleDirs, reportDirectory: MAVEN_REPORT_DIRECTORY };
  }
  runJavaPreset(projectRoot, options);
  requireGradleReports(projectRoot, options.policy?.preset ?? 'java');
  return { moduleDirs: [projectRoot], reportDirectory: REPORT_DIRECTORY };
}

export function collectJavaFindings(projectRoot, options = {}) {
  const preset = options.policy?.preset ?? 'java';
  const { moduleDirs, reportDirectory } = buildModules(projectRoot, options);
  for (const moduleDir of moduleDirs) {
    runJavaDuplicates(moduleDir, { reportDirectory });
  }
  if (preset === 'kotlin') {
    runKotlinDuplicates(projectRoot);
  }
  const { findings } = parseAnalyzerReport(
    {
      findings: readModuleFindings(projectRoot, moduleDirs, {
        reportDirectory,
        crapLimit: options.policy?.crapLimit,
        preset,
        fileLimits: options.policy?.fileLimits,
        exclude: options.policy?.exclude,
        exceptions: options.policy?.exceptions,
      }),
    },
    preset,
  );
  return applyJavaPolicy(findings, options.policy);
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
  const baseToHeadRenames = readRenameMap({
    repositoryRoot,
    mergeBaseSha: comparison.mergeBaseSha,
    headSha: comparison.headSha,
    projectRelativePath,
  });
  const options = { gradle, maven, initScript, policy };
  const collectAt = (sha) =>
    withTemporaryWorktree(repositoryRoot, sha, (worktreeRoot) =>
      collectJavaFindings(path.join(worktreeRoot, projectRelativePath), options),
    );

  const baseFindings = collectAt(comparison.mergeBaseSha);
  const headFindings = collectAt(comparison.headSha);
  const touchedCode = {
    changedLines: readChangedLines({
      repositoryRoot,
      mergeBaseSha: comparison.mergeBaseSha,
      headSha: comparison.headSha,
      projectRelativePath,
    }),
    isStrictRule: isJavaTouchedRule,
  };
  const result = compareFindings({ baseFindings, headFindings, baseToHeadRenames, touchedCode });
  const newEnforceable = result.newFindings.filter(
    (finding) => finding.classification === 'enforceable',
  );
  return { comparison, ...result, newEnforceable, failed: newEnforceable.length > 0 };
}
