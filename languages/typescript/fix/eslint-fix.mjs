import { realpathSync } from 'node:fs';
import path from 'node:path';
import { eslintChecks } from '../preset/quality-checks.mjs';
import { layoutTransformFor } from '../preset/tool-configs.mjs';
import { linkPolicyFile } from '../../../core/tooling/policy-links.mjs';
import { PACKAGE_ROOT, resolveTool } from '../../../core/tooling/tool-resolution.mjs';
import { containedPath } from '../../../core/fix/common/contained-path.mjs';
import { fixerError, runFixCommand } from '../../../core/fix/common/fix-command.mjs';
import { readBytes, splitByEncoding } from '../../../core/fix/common/fix-files.mjs';
import { formatNotes } from '../../../core/fix/common/fix-notes.mjs';
import { withFixedLineEndingsOf } from '../../../core/fix/common/rewrite/line-endings.mjs';
import { replaceIfUnchanged } from '../../../core/fix/common/rewrite/safe-write.mjs';

const eslintPolicy = eslintChecks.find(({ name }) => name === 'eslint-lint');

const TOOL = 'eslint --fix';

const REPORT_EXCERPT_LENGTH = 200;

function runEslint({ projectRoot, policyEnvironment, executeFixCommand }, files, linked) {
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
    },
    input: undefined,
    executeFixCommand,
  });
}

function namesByPath(projectRoot, files) {
  return new Map(
    files.flatMap(({ path: name }) => {
      const full = containedPath(projectRoot, name);
      return [
        [full, name],
        [realpathSync(full), name],
      ];
    }),
  );
}

function fixedOutputs(projectRoot, files, stdout) {
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
  const names = namesByPath(projectRoot, files);
  return results.flatMap(({ filePath, output }) => {
    const name = names.get(filePath);
    return typeof output === 'string' && name !== undefined ? [{ name, output }] : [];
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
    const result = runEslint(settings, files, linked);
    return {
      linked,
      ...writeOutputs(projectRoot, before, fixedOutputs(projectRoot, files, result.stdout)),
    };
  } catch (error) {
    return { linked, failure: error, rewritten: [], changedMeanwhile: [] };
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

function notesOf(outcome) {
  return formatNotes(TOOL, {
    rewritten: [],
    changedMeanwhile: [],
    keptAsIs: [],
    unformattable: [],
    ...outcome,
  });
}

export function eslintFixStep(settings, eslintFiles) {
  const { files, undecodable } = splitByEncoding(settings.projectRoot, eslintFiles);
  if (files.length === 0) {
    return { toolErrors: [], notes: notesOf({ undecodable }) };
  }
  const attempt = attemptEslintFix(settings, files, readBytes(settings.projectRoot, files));
  const removalFailure = removeLinkedFile(attempt.linked);
  const failure = attempt.failure ?? removalFailure;
  return {
    toolErrors: failure === undefined ? [] : [fixerError('eslint-fix', failure)],
    notes: notesOf({
      rewritten: attempt.rewritten,
      changedMeanwhile: attempt.changedMeanwhile,
      undecodable,
    }),
  };
}
