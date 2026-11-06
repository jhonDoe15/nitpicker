import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { eslintChecks } from '../preset/quality-checks.mjs';
import {
  PROJECT_LAYER_VARIABLE,
  projectLayerValue,
} from '../adapters/lint-engine/project-layer.mjs';
import { layoutTransformFor } from '../preset/tool-configs.mjs';
import { linkPolicyFile } from '../../../core/tooling/policy-links.mjs';
import { PACKAGE_ROOT, resolveTool } from '../../../core/tooling/tool-resolution.mjs';
import { containedPath } from '../../../core/fix/common/contained-path.mjs';
import { fixerError, runFixCommand } from '../../../core/fix/common/fix-command.mjs';
import { readBytes } from '../../../core/fix/common/fix-files.mjs';
import { formatNotes } from '../../../core/fix/common/fix-notes.mjs';
import { withFixedLineEndingsOf } from '../../../core/fix/common/rewrite/line-endings.mjs';
import { replaceIfUnchanged } from '../../../core/fix/common/rewrite/safe-write.mjs';

const eslintPolicy = eslintChecks.find(({ name }) => name === 'eslint-lint');

const TOOL = 'eslint --fix';

const REPORT_EXCERPT_LENGTH = 200;

function runEslint(settings, files, linked) {
  const { projectRoot, policyEnvironment, executeFixCommand } = settings;
  return runFixCommand({
    operation: 'eslint-fix',
    command: process.execPath,
    args: [
      resolveTool('eslint', { bin: 'bin/eslint.js' }).binPath,
      '--config',
      path.join(PACKAGE_ROOT, 'languages/typescript/adapters/eslint-wrapper.config.mjs'),
      '--fix-dry-run',
      '--format',
      'json',
      '--no-warn-ignored',
      '--',
      ...files.map(({ path: name }) => `./${name}`),
    ],
    cwd: projectRoot,
    acceptedStatuses: [0, 1],
    environment: {
      ...policyEnvironment,
      NITPICKER_DIFF_ESLINT_POLICY_CONFIG: path.join(PACKAGE_ROOT, eslintPolicy.configRelativePath),
      NITPICKER_DIFF_ESLINT_PROJECT_ROOT: projectRoot,
      NITPICKER_DIFF_ESLINT_PROJECT_CONFIG: linked.targetPath,
      [PROJECT_LAYER_VARIABLE]: projectLayerValue(settings.eslintSettings, {
        liveProjectRoot: projectRoot,
        addsRules: true,
      }),
    },
    input: undefined,
    executeFixCommand,
  });
}

function namesByPath(projectRoot, files) {
  return new Map(
    files.flatMap(({ path: name }) => {
      const full = containedPath(projectRoot, name);
      return existsSync(full)
        ? [
            [full, name],
            [realpathSync(full), name],
          ]
        : [[full, name]];
    }),
  );
}

function parseReport(stdout) {
  let results;
  try {
    results = JSON.parse(stdout);
  } catch (error) {
    throw new Error('ESLint returned invalid JSON', { cause: error });
  }
  if (!Array.isArray(results)) {
    throw new Error(
      `ESLint returned an unexpected report: ${stdout.slice(0, REPORT_EXCERPT_LENGTH)}`,
    );
  }
  return results;
}

function reportedFiles(projectRoot, files, stdout) {
  const names = namesByPath(projectRoot, files);
  return parseReport(stdout).map(({ filePath, output, messages = [] }) => {
    const name = names.get(filePath);
    if (name === undefined) {
      throw new Error(`ESLint reported a file it was not given: ${filePath}`);
    }
    return { name, output, fatal: messages.some(({ fatal }) => fatal === true) };
  });
}

function writeOutputs(projectRoot, before, outputs) {
  const planned = outputs
    .map(({ name, output }) => ({
      name,
      text: withFixedLineEndingsOf(before.get(name).toString('utf8'), output),
    }))
    .filter(({ name, text }) => text !== before.get(name).toString('utf8'));
  const written = planned.filter(({ name, text }) =>
    replaceIfUnchanged(containedPath(projectRoot, name), before.get(name), text),
  );
  return {
    rewritten: written.map(({ name }) => name),
    changedMeanwhile: planned.filter((entry) => !written.includes(entry)).map(({ name }) => name),
  };
}

function attemptEslintFix(settings, files, before) {
  const { projectRoot, layout } = settings;
  let linked;
  try {
    linked = linkPolicyFile(
      path.join(PACKAGE_ROOT, eslintPolicy.policyFiles[0]),
      path.join(projectRoot, '.nitpicker-fix-tsconfig.json'),
      layoutTransformFor(eslintPolicy.policyFiles[0], layout),
    );
    const reported = reportedFiles(projectRoot, files, runEslint(settings, files, linked).stdout);
    return {
      linked,
      unformattable: reported.filter(({ fatal }) => fatal).map(({ name }) => name),
      ...writeOutputs(
        projectRoot,
        before,
        reported.filter(({ output }) => typeof output === 'string'),
      ),
    };
  } catch (error) {
    return { linked, failure: error, rewritten: [], changedMeanwhile: [], unformattable: [] };
  }
}

function removeLinkedFile(linked) {
  try {
    linked?.remove();
    return undefined;
  } catch (error) {
    return error;
  }
}

export function eslintFixStep(settings, files) {
  if (files.length === 0) {
    return { toolErrors: [], notes: [] };
  }
  const attempt = attemptEslintFix(settings, files, readBytes(settings.projectRoot, files));
  const removalFailure = removeLinkedFile(attempt.linked);
  const failure = attempt.failure ?? removalFailure;
  return {
    toolErrors: failure === undefined ? [] : [fixerError('eslint-fix', failure)],
    notes: formatNotes(TOOL, {
      rewritten: attempt.rewritten,
      changedMeanwhile: attempt.changedMeanwhile,
      unformattable: attempt.unformattable,
      keptAsIs: [],
    }),
  };
}
