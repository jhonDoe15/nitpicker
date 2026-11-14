import { fixerError, fixSpawn } from '../../../core/fix/common/fix-command.mjs';
import { containedPath } from '../../../core/fix/common/contained-path.mjs';
import {
  collectFixFiles,
  excludedBy,
  readBytes,
  rewrittenPaths,
} from '../../../core/fix/common/fix-files.mjs';
import { formatNotes, linkNote } from '../../../core/fix/common/fix-notes.mjs';
import { rewriteFormatted } from '../../../core/fix/common/format-rewrite.mjs';
import { toolPrecedenceOf } from '../../../core/fix/common/tool-precedence.mjs';
import { failure, run } from '../adapters/execution/go-process.mjs';
import { formatterCommand } from '../adapters/formatting/go-format.mjs';
import { createGoContext } from '../adapters/go-steps.mjs';
import { isGeneratedGo } from '../adapters/structure/go-generated.mjs';

const GO_FILE = /\.go$/u;
const FIX_TOOL = 'go-format-fix';
const ORDER = ['gofmt', 'goimports', 'gofumpt'];
const SYNTAX_ERROR = /^<standard input>:\d+:\d+: /mu;
const SYNTAX_STATUS = 2;

function fixContext({ projectRoot, config, headPolicy, executeFixCommand, spawnEnvironment }) {
  return createGoContext({
    projectRoot,
    settings: config?.go ?? {},
    policy: { toolPrecedence: toolPrecedenceOf(headPolicy.tools), exclude: headPolicy.exclude },
    spawn: fixSpawn({ operation: FIX_TOOL, executeFixCommand }),
    environment: spawnEnvironment ?? {},
  });
}

function formattedOnce(context, command, { text }) {
  const result = run(context, command, {
    rule: 'go-format-failed',
    accepted: [0, SYNTAX_STATUS],
    input: text,
  });
  if (result.status === 0) {
    return result.stdout;
  }
  if (SYNTAX_ERROR.test(result.stderr ?? '')) {
    return undefined;
  }
  throw failure({ command, result, rule: 'go-format-failed' });
}

function sourceOptions(formatter, file) {
  return formatter === 'goimports' ? ['-srcdir', file] : [];
}

function formattedBy(context, commands, { file, source }) {
  const target = containedPath(context.projectRoot, file);
  return commands.reduce(
    (text, { formatter, command }) =>
      text === undefined
        ? undefined
        : formattedOnce(context, [...command, ...sourceOptions(formatter, target)], { text }),
    source,
  );
}

function goFormatter(context, formatters) {
  const commands = formatters.map((formatter) => ({
    formatter,
    command: formatterCommand(context, formatter),
  }));
  return function format(sources) {
    const formatted = new Map();
    const unformattable = [];
    for (const [file, source] of sources) {
      const text = formattedBy(context, commands, { file, source });
      if (text === undefined) {
        unformattable.push(file);
      } else {
        formatted.set(file, text);
      }
    }
    return { formatted, unformattable };
  };
}

function formatChanged(settings, files, mergeBaseSha) {
  const context = fixContext(settings);
  const formatters = ORDER.filter((name) => context.formatting.formatters.includes(name));
  const outcome = rewriteFormatted({
    projectRoot: settings.projectRoot,
    repositoryRoot: settings.repositoryRoot,
    mergeBaseSha,
    files,
    keepLineEndings: false,
    format: goFormatter(context, formatters),
  });
  return formatNotes(formatters.join(' and '), outcome);
}

function attempt(step) {
  try {
    return { toolErrors: [], notes: step() };
  } catch (error) {
    return { toolErrors: [{ ...fixerError(FIX_TOOL, error), rule: 'fix-failed' }], notes: [] };
  }
}

export function fixGo(settings) {
  const { repositoryRoot, projectRoot, baseRef, scope, headPolicy = {} } = settings;
  const excluded = excludedBy(headPolicy.exclude);
  const { comparison, files, links } = collectFixFiles({
    repositoryRoot,
    projectRoot,
    baseRef,
    scope,
    accepts: (name) => GO_FILE.test(name) && !excluded(name),
  });
  const handwritten = files.filter(({ path: name }) => !isGeneratedGo(projectRoot, name));
  if (handwritten.length === 0) {
    return { fixedFiles: [], toolErrors: [], notes: linkNote(links) };
  }
  const before = readBytes(projectRoot, handwritten);
  const { toolErrors, notes } = attempt(() =>
    formatChanged({ ...settings, headPolicy }, handwritten, comparison.mergeBaseSha),
  );
  return {
    fixedFiles: rewrittenPaths(projectRoot, handwritten, before),
    toolErrors,
    notes: [...notes, ...linkNote(links)],
  };
}
