import { mutationTargets, MUTATION_REPORT_PATH } from './mutation-scope.mjs';
import { readLayout } from '../../../preset/head-policy.mjs';
import {
  importPolicyModule,
  relativeProjectPath,
  runNodeTool,
  spawnNodeTool,
  policyFile,
} from './tooling.mjs';
import path from 'node:path';
import { normalizeMutation } from '../reporting/tests.mjs';
import { withMutationSourceHashes } from '../reporting/source-hashes.mjs';
import { rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import {
  TYPECHECK_FAILED_SKIPPED_RULE,
  TESTS_FAILED_SKIPPED_RULE,
} from '../../../../../shared/rules/finding-helpers.mjs';
import { toolErrorFinding } from '../reporting/vitest.mjs';
import { layoutTransformFor } from '../../../preset/tool-configs.mjs';
import { trackTemporaryPath } from '../../../../../core/tooling/temporary-files.mjs';

const STRYKER_TSCONFIG_TARGET = '.nitpicker-diff-tsconfig.stryker.json';

const STRYKER_CONFIG_PATH = 'languages/typescript/preset/defaults/stryker.config.mjs';

const INITIAL_TEST_RUN_FAILED_PATTERN = /failed tests in the initial test run/u;

const DRY_RUN_TYPECHECK_FAILED_PATTERN = /Typescript error\(s\) found in dry run compilation/u;

export async function runMutation(options) {
  const targets = mutationTargets(options, readLayout());
  if (targets?.length === 0) return [];
  const sourceConfig = (
    await importPolicyModule(options, STRYKER_CONFIG_PATH, `?run=${Date.now().toString()}`)
  ).default;
  const configPath = path.join(options.projectRoot, '.nitpicker-diff-stryker.config.mjs');
  const createdFiles = [];
  try {
    writeStrykerConfig({ options, sourceConfig, targets, configPath, createdFiles });
    const skippedFindings = runStrykerOrExplainSkip(options, configPath);
    if (skippedFindings !== undefined) {
      return skippedFindings;
    }
    const report = readMutationReport(options.projectRoot);
    return normalizeMutation(
      withMutationSourceHashes(report, options.projectRoot),
      options.analyzerName,
    );
  } finally {
    for (const filePath of createdFiles.reverse()) {
      rmSync(filePath, { force: true });
    }
  }
}

function writeStrykerConfig({ options, sourceConfig, targets, configPath, createdFiles }) {
  const tsconfigPath = installStrykerTsconfig(options, sourceConfig.tsconfigFile, createdFiles);
  const vitestConfigPath = installMutationCompanion(
    options,
    [sourceConfig.vitest?.configFile, '.nitpicker-diff-stryker.vitest.config.ts'],
    createdFiles,
  );
  const config = {
    ...rebaseMutationConfig(sourceConfig, {
      tsconfigFile: relativeProjectPath(options.projectRoot, tsconfigPath),
      vitestConfigFile: relativeProjectPath(options.projectRoot, vitestConfigPath),
    }),
    ...(targets === undefined ? {} : { mutate: targets }),
    reporters: ['json'],
    jsonReporter: { fileName: MUTATION_REPORT_PATH },
  };
  writeTemporaryFile(
    configPath,
    `export default ${JSON.stringify(config, null, 2)};\n`,
    createdFiles,
  );
}

const SKIP_MESSAGES = {
  head: {
    typecheck:
      'mutation skipped: the change does not type-check (see typescript-typecheck findings)',
    tests: 'mutation skipped: tests fail (see coverage findings)',
  },
  base: {
    typecheck:
      'mutation skipped: the base commit does not type-check, so its mutants cannot be compared. Fix the base first; a missing @types/node is the usual cause.',
    tests:
      'mutation skipped: the base commit fails its own tests, so its mutants are unknown there.',
  },
};

export function mutationSkipFor(errorMessage, snapshot = 'head') {
  const messages = SKIP_MESSAGES[snapshot];
  if (DRY_RUN_TYPECHECK_FAILED_PATTERN.test(errorMessage)) {
    return { rule: TYPECHECK_FAILED_SKIPPED_RULE, message: messages.typecheck };
  }
  return INITIAL_TEST_RUN_FAILED_PATTERN.test(errorMessage)
    ? { rule: TESTS_FAILED_SKIPPED_RULE, message: messages.tests }
    : undefined;
}

function runStrykerOrExplainSkip(options, configPath) {
  try {
    runNodeTool({
      options,
      relativeToolPath: '@stryker-mutator/core/bin/stryker.js',
      arguments_: ['run', configPath],
      acceptedStatuses: [0],
    });
    return undefined;
  } catch (error) {
    const skip =
      error instanceof Error ? mutationSkipFor(error.message, options.snapshot) : undefined;
    if (skip === undefined) {
      throw error;
    }
    return [toolErrorFinding(options, skip)];
  }
}

function readMutationReport(projectRoot) {
  return JSON.parse(readFileSync(path.join(projectRoot, MUTATION_REPORT_PATH), 'utf8'));
}

export function rebaseMutationConfig(sourceConfig, { tsconfigFile, vitestConfigFile }) {
  return {
    ...sourceConfig,
    tsconfigFile,
    vitest: {
      ...sourceConfig.vitest,
      configFile: vitestConfigFile,
    },
  };
}

export function installStrykerTsconfig(options, sourceRelativePath, createdFiles) {
  const target = [sourceRelativePath, STRYKER_TSCONFIG_TARGET];
  const tsconfigPath = installMutationCompanion(options, target, createdFiles);
  if (!typechecksCleanly(options, tsconfigPath)) {
    writeFileSync(tsconfigPath, mutationCompanionText(options, target, { strictMutants: false }));
  }
  return tsconfigPath;
}

function typechecksCleanly(options, tsconfigPath) {
  return (
    spawnNodeTool({
      options,
      relativeToolPath: 'typescript/bin/tsc',
      arguments_: ['--project', tsconfigPath, '--noEmit', '--incremental', 'false'],
    }).status === 0
  );
}

function installMutationCompanion(options, target, createdFiles) {
  const targetPath = path.join(options.projectRoot, target[1]);
  writeTemporaryFile(targetPath, mutationCompanionText(options, target), createdFiles);
  return targetPath;
}

function mutationCompanionText(options, [sourceRelativePath, targetName], transformOptions) {
  const sourcePath = policyFile(
    options.policyRoot,
    companionPath(path.posix.dirname(STRYKER_CONFIG_PATH), sourceRelativePath),
  );
  const targetPath = path.join(options.projectRoot, targetName);
  const transform = layoutTransformFor(sourceRelativePath ?? '', readLayout(), transformOptions);
  const text = readFileSync(sourcePath, 'utf8');
  return transform === undefined ? text : transform(text, targetPath);
}

function companionPath(configDirectory, relativePath) {
  if (
    typeof relativePath !== 'string' ||
    relativePath.length === 0 ||
    path.isAbsolute(relativePath)
  ) {
    return relativePath;
  }
  return path.posix.join(configDirectory, relativePath.replaceAll('\\', '/'));
}

function writeTemporaryFile(filePath, contents, createdFiles) {
  if (existsSync(filePath)) {
    throw new Error(`Temporary mutation config already exists: ${filePath}`);
  }
  trackTemporaryPath(filePath);
  createdFiles.push(filePath);
  writeFileSync(filePath, contents);
}
