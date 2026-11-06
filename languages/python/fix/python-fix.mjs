import { fixerError } from '../../../core/fix/common/fix-command.mjs';
import {
  collectFixFiles,
  excludedBy,
  readBytes,
  rewrittenBy,
  rewrittenPaths,
  splitByEncoding,
} from '../../../core/fix/common/fix-files.mjs';
import { rewriteFormatted } from '../../../core/fix/common/format-rewrite.mjs';
import { formatNotes, linkNote, rewrittenNote } from '../../../core/fix/common/fix-notes.mjs';
import { failure } from '../adapters/execution/python-process.mjs';
import { onlyUnparsableFiles } from '../adapters/python-tools.mjs';
import {
  FORMAT_FAILURE_STATUS,
  formatStdinCommand,
  lintFixCommand,
} from './python-fix-commands.mjs';
import { commandRunner, withPythonFixContext } from './python-fix-session.mjs';

const PYTHON_FILE = /\.(?:pyi?|ipynb)$/u;
const JUPYTER_MISSING = /Jupyter dependencies are not installed/u;
const FORMATTERS = {
  ruff: { operation: 'ruff-format-fix', label: 'ruff format' },
  black: { operation: 'black-fix', label: 'black' },
};

function fixFailure(tool, error) {
  return { ...fixerError(tool, error), rule: 'fix-failed' };
}

function attempt(tool, step) {
  try {
    return { toolErrors: [], notes: step() };
  } catch (error) {
    return { toolErrors: [fixFailure(tool, error)], notes: [] };
  }
}

function notebookNote(skipped) {
  return skipped.size === 0
    ? []
    : [
        `black left ${[...skipped].join(', ')} as is: Black formats notebooks only with its jupyter extra (black[jupyter]) installed`,
      ];
}

function stdinFormatter(context, run, skipped) {
  const { formatter } = context.project;
  const { operation } = FORMATTERS[formatter];
  return function format(sources) {
    const formatted = new Map();
    const unformattable = [];
    for (const [file, source] of sources) {
      const command = formatStdinCommand(context, file);
      const result = run({
        operation,
        command,
        acceptedStatuses: [0, FORMAT_FAILURE_STATUS[formatter]],
        input: source,
      });
      if (result.status === 0 && JUPYTER_MISSING.test(result.stderr ?? '')) {
        skipped.add(file);
      } else if (result.status === 0) {
        formatted.set(file, result.stdout);
      } else if (onlyUnparsableFiles(formatter, result)) {
        unformattable.push(file);
      } else {
        throw new Error(`${operation} failed: ${failure({ context, command, result }).message}`);
      }
    }
    return { formatted, unformattable };
  };
}

function lintStep({ context, run, projectRoot, files }) {
  const decodable = splitByEncoding(projectRoot, files).files;
  const paths = decodable.map(({ path: name }) => name);
  if (paths.length === 0) {
    return [];
  }
  return rewrittenNote(
    'ruff check --fix',
    rewrittenBy(projectRoot, decodable, () => {
      run({
        operation: 'ruff-fix',
        command: lintFixCommand(context, paths),
        acceptedStatuses: [0, 1],
      });
    }),
  );
}

function formatStep({ context, run, settings, files, mergeBaseSha }) {
  const { repositoryRoot, projectRoot } = settings;
  const skipped = new Set();
  const outcome = rewriteFormatted({
    projectRoot,
    repositoryRoot,
    mergeBaseSha,
    files,
    format: stdinFormatter(context, run, skipped),
  });
  return [
    ...formatNotes(FORMATTERS[context.project.formatter].label, outcome),
    ...notebookNote(skipped),
  ];
}

function runFixers(settings, files, mergeBaseSha) {
  try {
    return withPythonFixContext(settings, (context) => {
      const run = commandRunner(context, settings.executeFixCommand);
      const step = {
        context,
        run,
        settings,
        projectRoot: settings.projectRoot,
        files,
        mergeBaseSha,
      };
      const outcomes = [
        attempt('ruff-fix', () => lintStep(step)),
        attempt(FORMATTERS[context.project.formatter].operation, () => formatStep(step)),
      ];
      return {
        toolErrors: outcomes.flatMap(({ toolErrors }) => toolErrors),
        notes: outcomes.flatMap(({ notes }) => notes),
      };
    });
  } catch (error) {
    return { toolErrors: [fixFailure('python-fix', error)], notes: [] };
  }
}

export function fixPython(settings) {
  const { repositoryRoot, projectRoot, baseRef, headPolicy = {} } = settings;
  const excluded = excludedBy(headPolicy.exclude);
  const { comparison, files, links } = collectFixFiles({
    repositoryRoot,
    projectRoot,
    baseRef,
    accepts: (name) => PYTHON_FILE.test(name) && !excluded(name),
  });
  if (files.length === 0) {
    return { fixedFiles: [], toolErrors: [], notes: linkNote(links) };
  }
  const before = readBytes(projectRoot, files);
  const { toolErrors, notes } = runFixers(
    { ...settings, headPolicy },
    files,
    comparison.mergeBaseSha,
  );
  return {
    fixedFiles: rewrittenPaths(projectRoot, files, before),
    toolErrors,
    notes: [...notes, ...linkNote(links)],
  };
}
