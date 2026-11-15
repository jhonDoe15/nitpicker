import { fixSpawn } from '../../../core/fix/common/fix-command.mjs';
import { toolPrecedenceOf } from '../../../core/fix/common/tool-precedence.mjs';
import { failure, run } from '../adapters/execution/go-process.mts';
import { formatterCommand } from '../adapters/formatting/go-format.mts';
import { createGoContext } from '../adapters/go-steps.mts';
import {
  collectFixFiles,
  containedPath,
  excludedBy,
  fixerError,
  formatNotes,
  linkNote,
  readBytes,
  rewriteFormatted,
  rewrittenPaths,
} from '../../../core/fix/typed/fix-views.mts';
import { isGeneratedGo } from '../adapters/structure/go-generated.mts';
import { fieldOf, fieldsOf, textsOf } from '../../../shared/values/readers.mts';
import type { Environment } from '../../../shared/processes/environment.mts';
import type { FixFile, FixOutcome, FixSettings } from '../../../core/fix/typed/fix-types.mts';
import type { GoContext } from '../adapters/go-types.mts';

type GoFixSettings = FixSettings & { readonly spawnEnvironment?: Environment | undefined };
type FormatCommand = { formatter: string; command: readonly string[] };

const GO_FILE = /\.go$/u;
const FIX_TOOL = 'go-format-fix';
const ORDER = ['gofmt', 'goimports', 'gofumpt'];
const SYNTAX_ERROR = /^<standard input>:\d+:\d+: /mu;
const SYNTAX_STATUS = 2;

function fixContext({
  projectRoot,
  config,
  headPolicy,
  executeFixCommand,
  spawnEnvironment,
}: GoFixSettings): GoContext {
  return createGoContext({
    projectRoot,
    reportRoot: '',
    settings: fieldsOf(fieldOf(config, 'go')),
    policy: {
      toolPrecedence: toolPrecedenceOf(fieldsOf(fieldOf(headPolicy, 'tools'))),
      exclude: textsOf(fieldOf(headPolicy, 'exclude')),
    },
    spawn: fixSpawn({ operation: FIX_TOOL, executeFixCommand }),
    environment: spawnEnvironment ?? {},
  });
}

function formattedOnce(context: GoContext, command: readonly string[], { text }: { text: string }) {
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

function sourceOptions(formatter: string, file: string) {
  return formatter === 'goimports' ? ['-srcdir', file] : [];
}

function formattedBy(
  context: GoContext,
  commands: readonly FormatCommand[],
  { file, source }: { file: string; source: string },
) {
  const target = containedPath(context.projectRoot, file);
  return commands.reduce<string | undefined>(
    (text, { formatter, command }) =>
      text === undefined
        ? undefined
        : formattedOnce(context, [...command, ...sourceOptions(formatter, target)], { text }),
    source,
  );
}

function goFormatter(context: GoContext, formatters: readonly string[]) {
  const commands = formatters.map((formatter) => ({
    formatter,
    command: formatterCommand(context, formatter),
  }));
  return function format(sources: Iterable<readonly [string, string]>) {
    const formatted = new Map<string, string>();
    const unformattable: string[] = [];
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

function formatChanged(
  settings: GoFixSettings,
  files: readonly FixFile[],
  mergeBaseSha: string | undefined,
) {
  const context = fixContext(settings);
  const formatters = ORDER.filter((name) => context.formatting.formatters.includes(name));
  const outcome = rewriteFormatted({
    projectRoot: settings.projectRoot,
    repositoryRoot: settings.repositoryRoot,
    mergeBaseSha,
    files,
    keepLineEndings: false,
    allFiles: false,
    format: goFormatter(context, formatters),
  });
  return formatNotes(formatters.join(' and '), outcome);
}

function attempt(step: () => string[]) {
  try {
    return { toolErrors: [], notes: step() };
  } catch (error) {
    return { toolErrors: [{ ...fixerError(FIX_TOOL, error), rule: 'fix-failed' }], notes: [] };
  }
}

export function fixGo(settings: GoFixSettings): FixOutcome {
  const { repositoryRoot, projectRoot, baseRef, scope, headPolicy = {} } = settings;
  const excluded = excludedBy(textsOf(fieldOf(headPolicy, 'exclude')));
  const { comparison, files, links } = collectFixFiles({
    repositoryRoot,
    projectRoot,
    baseRef,
    scope,
    allFiles: false,
    accepts: (name: string) => GO_FILE.test(name) && !excluded(name),
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
