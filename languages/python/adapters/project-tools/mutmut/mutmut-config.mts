import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseIni } from '../../configuration/ini-parser.mts';
import { isDjangoProject } from '../../configuration/pytest/collection-options.mts';
import { readOptional } from '../../execution/python-project.mts';
import { mutmutTestPatterns } from '../../execution/python-test-files.mts';
import {
  fieldOf,
  fieldsOf,
  messageOf,
  textOf,
  textsOf,
  type Fields,
} from '../../../../../shared/values/readers.mts';
import type { FailWith, MutmutConfig, MutmutContext } from '../typed/tool-types.mts';
import { missingProjectConfig } from '../../../../../shared/conventions/tool-precedence.mjs';
import { attempt, parseToml, stringifyToml, toolLayers, unique } from '../project-tool-layers.mts';
import {
  listedProjectFiles,
  outsideScopePatterns,
} from '../../../../../core/scope/mutation-scope.mjs';

type MutmutRequest = { readonly context: MutmutContext; readonly fail: FailWith };

export const MUTMUT_TOOL = 'mutmut';
const MUTMUT_LOOKED = 'a mutmut config ([tool.mutmut] in pyproject.toml, or [mutmut] in setup.cfg)';
const PYPROJECT = 'pyproject.toml';
const SETUP_CFG = 'setup.cfg';
const PYTHON_FILES = ':(glob)**/*.py';
const RUN_KEYS = [
  'also_copy',
  'process_isolation',
  'forkserver_warmup',
  'preload_modules_file',
  'max_forkserver_restarts',
  'use_setproctitle',
];
const SOURCE_KEYS = ['source_paths', 'paths_to_mutate'];
const LIST_KEYS = new Set([
  'also_copy',
  'only_mutate',
  'do_not_mutate',
  'do_not_mutate_patterns',
  'source_paths',
  'paths_to_mutate',
  'tests_dir',
  'pytest_add_cli_args',
  'pytest_add_cli_args_test_selection',
  'type_check_command',
  'cache_invalidation_files',
  'cache_invalidation_exclude',
]);
const BOOLEAN_KEYS = new Set([
  'debug',
  'mutate_only_covered_lines',
  'use_setproctitle',
  'track_dependencies',
  'use_git_change_detection',
  'log_to_file',
]);
const NUMBER_KEYS = new Set([
  'max_stack_depth',
  'dependency_tracking_depth',
  'max_forkserver_restarts',
  'timeout_multiplier',
  'timeout_constant',
]);
function typedValue(key: string, text: string): unknown {
  if (LIST_KEYS.has(key)) {
    return text.includes('\n') ? text.split('\n').filter(Boolean) : [text];
  }
  if (BOOLEAN_KEYS.has(key)) {
    return ['1', 't', 'true'].includes(text.toLowerCase());
  }
  return NUMBER_KEYS.has(key) ? Number(text) : text;
}

function setupCfgTable(root: string): Fields | undefined {
  const section = parseIni(readOptional(path.join(root, SETUP_CFG))).get(MUTMUT_TOOL);
  return section === undefined
    ? undefined
    : Object.fromEntries([...section].map(([key, text]) => [key, typedValue(key, text.trim())]));
}

export function readMutmutConfig(root: string): MutmutConfig | undefined {
  const table = fieldOf(
    fieldOf(parseToml(readOptional(path.join(root, PYPROJECT))), 'tool'),
    MUTMUT_TOOL,
  );
  if (table !== undefined) {
    return { file: PYPROJECT, table: fieldsOf(table) };
  }
  const setupCfg = setupCfgTable(root);
  return setupCfg === undefined ? undefined : { file: SETUP_CFG, table: setupCfg };
}

function excludedPatterns(exclude: readonly string[]): string[] {
  return exclude.flatMap((glob) => [glob, `${glob.replace(/\/+$/u, '')}/*`]);
}

function outsideScope({ projectRoot, mutationScope }: MutmutContext): string[] {
  return mutationScope === undefined
    ? []
    : textsOf(outsideScopePatterns(listedProjectFiles(projectRoot, [PYTHON_FILES]), mutationScope));
}

export function ignoredMutmutKeys(table: Fields): string[] {
  return Object.keys(table).filter((key) => !(RUN_KEYS.includes(key) || SOURCE_KEYS.includes(key)));
}

function pick(table: Fields, keys: readonly string[]): Fields {
  return Object.fromEntries(
    keys.filter((key) => table[key] !== undefined).map((key) => [key, table[key]]),
  );
}

function sourceOf(table: Fields): unknown {
  return table['source_paths'] ?? table['paths_to_mutate'];
}

function mutmutSettings({ context, fail }: MutmutRequest): Fields {
  const layers = toolLayers(context, MUTMUT_TOOL);
  const found = readProject(layers.configRoot, fail);
  if (layers.optedIn && found === undefined) {
    throw fail(
      textOf(missingProjectConfig(MUTMUT_TOOL, `${MUTMUT_LOOKED} (searched ${layers.configRoot})`)),
    );
  }
  const table = found?.table ?? {};
  const { sourceRoots } = context.project;
  const needsProjectSource = sourceRoots.includes('.');
  const projectSource = layers.appliesProject || needsProjectSource ? sourceOf(table) : undefined;
  if (needsProjectSource && projectSource === undefined) {
    throw fail(
      [
        'mutmut needs the directories to mutate:',
        'set "python.sourceRoots" in nitpicker.config.json or source_paths in [tool.mutmut]',
      ].join(' '),
    );
  }
  const nitpicker = {
    source_paths: projectSource ?? sourceRoots,
    do_not_mutate: unique([
      ...mutmutTestPatterns({ django: isDjangoProject(context.projectRoot) }),
      ...excludedPatterns(context.exclude),
      ...outsideScope(context),
    ]),
  };
  if (!layers.appliesProject) {
    return { ...nitpicker, ...pick(table, RUN_KEYS) };
  }
  return {
    ...nitpicker,
    ...Object.fromEntries(Object.entries(table).filter(([key]) => !SOURCE_KEYS.includes(key))),
    do_not_mutate: unique([...nitpicker.do_not_mutate, ...textsOf(table['do_not_mutate'])]),
  };
}

function sectionText(settings: Fields): string {
  const defined = Object.entries(settings).filter(
    ([, value]) => value !== undefined && value !== null,
  );
  return stringifyToml({ tool: { mutmut: Object.fromEntries(defined) } });
}

function without(object: Fields, key: string): Fields {
  return Object.fromEntries(Object.entries(object).filter(([name]) => name !== key));
}

function withoutMutmutTable(text: string): string {
  const parsed = parseToml(text);
  const tool = fieldsOf(parsed['tool']);
  if (tool[MUTMUT_TOOL] === undefined) {
    return text;
  }
  const tools = without(tool, MUTMUT_TOOL);
  const rewritten = stringifyToml(
    Object.keys(tools).length === 0 ? without(parsed, 'tool') : { ...parsed, tool: tools },
  );
  return rewritten.trim() === '' ? '' : rewritten;
}

function unparsable(error: unknown, fail: FailWith): Error {
  return fail(`${PYPROJECT} could not be parsed (${messageOf(error)}): fix it`);
}

function readProject(root: string, fail: FailWith): MutmutConfig | undefined {
  const { value, error } = attempt(() => readMutmutConfig(root));
  if (error !== undefined) {
    throw unparsable(error, fail);
  }
  return value;
}

export function writeMutmutConfig({ context, fail }: MutmutRequest): void {
  const settings = mutmutSettings({ context, fail });
  const pyproject = path.join(context.projectRoot, PYPROJECT);
  const { value: kept, error } = attempt(() => withoutMutmutTable(readOptional(pyproject)));
  if (error !== undefined) {
    throw unparsable(error, fail);
  }
  writeFileSync(pyproject, `${kept ?? ''}\n${sectionText(settings)}`);
}
