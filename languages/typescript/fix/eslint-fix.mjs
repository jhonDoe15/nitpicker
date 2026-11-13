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
import { selectedEslintRules, selectedOutput } from './selection/selected-fixes.mjs';
import { writeTexts } from '../../../core/fix/engine/write-texts.mjs';
import { applySuggestions } from './suggestions/apply-suggestions.mjs';

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
      ...(settings.selectedRules.length === 0 ? ['--fix-dry-run'] : []),
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
    return { name, output, messages, fatal: messages.some(({ fatal }) => fatal === true) };
  });
}

function fixedText(settings, original, { output, messages, fatal }) {
  if (fatal) {
    return { text: typeof output === 'string' ? output : original, applied: [] };
  }
  if (settings.selectedRules.length === 0) {
    const base = typeof output === 'string' ? output : original;
    return applySuggestions({ text: base, messages, selectedRules: [] });
  }
  const { text, suggested } = selectedOutput(
    original,
    messages,
    selectedEslintRules(settings.selectedRules),
  );
  return { text: text ?? original, applied: suggested };
}

function plannedTexts(settings, before, reported) {
  const findings = [];
  const planned = reported.flatMap((file) => {
    const original = before.get(file.name).toString('utf8');
    const { text: fixed, applied } = fixedText(settings, original, file);
    findings.push(
      ...applied.map(({ rule, line }) => `${file.name}:${line} ${rule} (eslint-suggestion)`),
    );
    const text = withFixedLineEndingsOf(original, fixed);
    return text === original ? [] : [{ name: file.name, text }];
  });
  return { planned, findings };
}

function writeOutputs(settings, before, reported) {
  const { planned, findings } = plannedTexts(settings, before, reported);
  const { written, changedMeanwhile, unwritable } = writeTexts(
    settings.writer,
    planned.map(({ name, text }) => ({ name, bytes: before.get(name), text })),
    TOOL,
  );
  const kept = new Set(written);
  return {
    rewritten: written,
    changedMeanwhile,
    unwritable,
    fixedFindings: findings.filter((finding) => kept.has(finding.slice(0, finding.indexOf(':')))),
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
      ...writeOutputs(settings, before, reported),
    };
  } catch (error) {
    return {
      linked,
      failure: error,
      rewritten: [],
      fixedFindings: [],
      changedMeanwhile: [],
      unformattable: [],
      unwritable: [],
    };
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
  const unselected =
    settings.selectedRules.length > 0 && selectedEslintRules(settings.selectedRules).length === 0;
  if (files.length === 0 || unselected) {
    return { toolErrors: [], notes: [], fixedFindings: [] };
  }
  const attempt = attemptEslintFix(settings, files, readBytes(settings.projectRoot, files));
  const removalFailure = removeLinkedFile(attempt.linked);
  const failure = attempt.failure ?? removalFailure;
  return {
    toolErrors: failure === undefined ? [] : [fixerError('eslint-fix', failure)],
    fixedFindings: attempt.fixedFindings,
    notes: formatNotes(TOOL, {
      rewritten: attempt.rewritten,
      changedMeanwhile: attempt.changedMeanwhile,
      unformattable: attempt.unformattable,
      unwritable: attempt.unwritable,
      keptAsIs: [],
    }),
  };
}
