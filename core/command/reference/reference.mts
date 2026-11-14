import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE_NAME, configError } from '../../../shared/config.mjs';
import { PRESETS } from '../../../shared/reference/entry.mjs';
import { repositoryUrl } from '../../../shared/reference/facts.mjs';
import { applyDisable, readConfigFile } from '../../configuration/config.mjs';
import { presetAnalyzers } from '../../configuration/preset-analyzers.mts';
import { docsRootUrl } from '../../../shared/messages/docs-url.mjs';
import { analyzersOf } from '../../../shared/values/analyzers.mts';
import type { TextOutput } from '../../cli-context.mts';
import type { NitpickerConfig } from '../../configuration/config-types.mts';
import {
  type Entry,
  type EntryIndex,
  type Fact,
  closestNames,
  fixStatusOf,
  directoriesUp,
  entriesNamed,
  entryUrl,
  factsOf,
  indexOf,
  linkTarget,
  linksOf,
  presetTitles,
  readEntries,
  textFor,
} from './reference-entries.mts';

type Reference = { readonly index: EntryIndex; readonly root: string | undefined };

type ReferenceCli = {
  readonly commandArguments: readonly string[];
  readonly stdout: TextOutput;
  readonly stderr: TextOutput;
  readonly currentProjectRoot?: string | undefined;
};

type RulesOptions = { preset?: string; tool?: string; fixable: boolean };

const EXPLAIN_USAGE = 'Usage: nitpicker explain <tool/rule>...\n';
const RULES_USAGE = `Usage: nitpicker rules [--preset <${PRESETS.join('|')}>] [--tool <name>] [--fixable]\n`;
const DEFAULT_PRESET = 'typescript';
const FIRST_SENTENCE = /^.*?[.!?](?=\s|$)/su;
const INDENT = '  ';
const CHECKS_PAGE = 'checks';
const CHECKS_CATALOG = 'spec/checks.md';
const CATEGORY_ANCHOR = 'quality-area-checks';

function factLines({ label, text = '', items, code }: Fact, root: string | undefined): string[] {
  if (code !== undefined) {
    return [`${label}:`, ...code.split('\n').map((line) => `${INDENT}${line}`)];
  }
  return items === undefined
    ? [`${label}: ${textFor(text, root)}`]
    : [`${label}:`, ...items.map((item) => `${INDENT}- ${textFor(item, root)}`)];
}

function urlLines(label: string, url: string | undefined): string[] {
  return url === undefined ? [] : [`${label}: ${url}`];
}

function explainText(entry: Entry, root: string | undefined): string {
  return [
    entry.id,
    textFor(entry.summary, root),
    '',
    ...factsOf(entry).flatMap((fact) => factLines(fact, root)),
    ...linksOf(entry).flatMap((link) => urlLines(link.label, linkTarget(link, root))),
    ...urlLines('Reference', entryUrl(entry, root)),
    '',
  ].join('\n');
}

function categoryText(name: string, rules: readonly Entry[], root: string | undefined): string {
  return [
    name,
    'A check nitpicker runs itself. Its rules (nitpicker explain <rule> describes one):',
    ...rules.map((entry) => `${INDENT}${summaryLine(entry, root)}`),
    ...urlLines('Checks catalog', repositoryUrl(CHECKS_CATALOG, CATEGORY_ANCHOR, root)),
    '',
  ].join('\n');
}

function explained({ index, root }: Reference, name: string): string[] {
  const found = entriesNamed(index, name);
  if (found.length > 0) {
    return found.map((entry) => explainText(entry, root));
  }
  const rules = index.entries.filter((entry) => entry.page === CHECKS_PAGE && entry.tool === name);
  return rules.length === 0 ? [] : [categoryText(name, rules, root)];
}

export function runExplainCommand({ commandArguments, stdout, stderr }: ReferenceCli): number {
  if (commandArguments.includes('--help')) {
    stdout.write(EXPLAIN_USAGE);
    return 0;
  }
  if (
    commandArguments.length === 0 ||
    commandArguments.some((argument) => argument.startsWith('--'))
  ) {
    stderr.write(EXPLAIN_USAGE);
    return 2;
  }
  const reference: Reference = { index: indexOf(readEntries()), root: docsRootUrl() };
  const index = reference.index;
  const texts = new Map(commandArguments.map((name) => [name, explained(reference, name)]));
  const unknown = commandArguments.filter((name) => (texts.get(name) ?? []).length === 0);
  stdout.write([...texts.values()].flat().join('\n'));
  for (const name of unknown) {
    const closest = closestNames(index, name);
    stderr.write(
      `nitpicker: unknown rule "${name}".${closest.length === 0 ? '' : ` Closest: ${closest.join(', ')}.`} ` +
        'Run nitpicker rules to list the rules.\n',
    );
  }
  return unknown.length === 0 ? 0 : 1;
}

const RULES_OPTIONS: ReadonlyMap<string, 'preset' | 'tool'> = new Map([
  ['--preset', 'preset'],
  ['--tool', 'tool'],
]);
const FIXABLE_FLAG = '--fixable';
const FIXABLE_STATUSES: ReadonlyMap<string, string> = new Map([
  ['automatic', 'automatic'],
  ['review', 'with --fix --rule'],
]);

function splitOption(argument: string): readonly [string, string | undefined] {
  const equals = argument.indexOf('=');
  return equals === -1
    ? [argument, undefined]
    : [argument.slice(0, equals), argument.slice(equals + 1)];
}

function applyRulesOption(
  options: RulesOptions,
  argument: string,
  remaining: ArrayIterator<string>,
): string | undefined {
  const [flag, inline] = splitOption(argument);
  if (flag === FIXABLE_FLAG && inline === undefined) {
    options.fixable = true;
    return undefined;
  }
  const property = RULES_OPTIONS.get(flag);
  if (property === undefined) {
    return RULES_USAGE;
  }
  const value = inline ?? remaining.next().value;
  if (value === undefined || value === '' || value.startsWith('--')) {
    return `nitpicker: ${flag} requires a value.\n${RULES_USAGE}`;
  }
  options[property] = value;
  return undefined;
}

function readRulesOptions(
  commandArguments: readonly string[],
): { readonly options: RulesOptions; readonly error?: undefined } | { readonly error: string } {
  const options: RulesOptions = { fixable: false };
  const remaining = commandArguments.values();
  for (const argument of remaining) {
    const error = applyRulesOption(options, argument, remaining);
    if (error !== undefined) {
      return { error };
    }
  }
  if (options.preset !== undefined && !PRESETS.includes(options.preset)) {
    return {
      error: `nitpicker: --preset got "${options.preset}". Presets: ${PRESETS.join(', ')}.\n${RULES_USAGE}`,
    };
  }
  return { options };
}

function configRootFrom(start: string): string | undefined {
  const directories = directoriesUp(start, (directory) => {
    const parent = path.dirname(directory);
    return parent === directory ? undefined : parent;
  });
  return directories.find((directory) => existsSync(path.join(directory, CONFIG_FILE_NAME)));
}

function enabledAnalyzers(preset: string, config: NitpickerConfig): ReadonlySet<string> {
  const analyzers = presetAnalyzers({ ...config, preset });
  const configured = config.preset === preset ? config : {};
  return new Set(analyzersOf(applyDisable(analyzers, configured)).map(({ name }) => name));
}

function reportsFor(names: readonly string[] | undefined, enabled: ReadonlySet<string>): boolean {
  return names !== undefined && (names.length === 0 || names.some((name) => enabled.has(name)));
}

function summaryLine(entry: Entry, root: string | undefined): string {
  const sentence = FIRST_SENTENCE.exec(entry.summary)?.[0] ?? entry.summary;
  return `${entry.id}  ${textFor(sentence.replaceAll(/\s+/gu, ' '), root)}`;
}

function listedEntries(
  preset: string,
  config: NitpickerConfig,
  { tool, fixable }: RulesOptions,
): readonly Entry[] {
  const enabled = enabledAnalyzers(preset, config);
  return readEntries()
    .filter(({ analyzers }) => reportsFor(analyzers[preset], enabled))
    .filter(
      (entry) => tool === undefined || [entry.tool, ...(entry.findingTools ?? [])].includes(tool),
    )
    .filter((entry) => !fixable || FIXABLE_STATUSES.has(fixStatusOf(entry, preset)));
}

function rulesPreset(
  options: RulesOptions,
  currentProjectRoot: string | undefined,
): { readonly preset: string; readonly config: NitpickerConfig } {
  const configRoot = configRootFrom(realpathSync(currentProjectRoot ?? process.cwd()));
  const config: NitpickerConfig = configRoot === undefined ? {} : readConfigFile(configRoot);
  const preset = options.preset ?? config.preset ?? DEFAULT_PRESET;
  if (!PRESETS.includes(preset)) {
    throw configError(`unknown preset "${preset}". Presets: ${PRESETS.join(', ')}`);
  }
  return { preset, config };
}

function ruleLine(entry: Entry, preset: string, fixable: boolean): string {
  const line = summaryLine(entry, docsRootUrl());
  return fixable ? `${line} [${FIXABLE_STATUSES.get(fixStatusOf(entry, preset)) ?? ''}]` : line;
}

function rulesText(preset: string, listed: readonly Entry[], fixable: boolean): string {
  return (
    `${presetTitles[preset] ?? preset} preset: ${String(listed.length)} ${fixable ? 'fixable ' : ''}rules. ` +
    'nitpicker explain <tool/rule> describes one.\n' +
    listed.map((entry) => `${ruleLine(entry, preset, fixable)}\n`).join('')
  );
}

export function runRulesCommand({
  commandArguments,
  stdout,
  stderr,
  currentProjectRoot,
}: ReferenceCli): number {
  if (commandArguments.includes('--help')) {
    stdout.write(RULES_USAGE);
    return 0;
  }
  const read = readRulesOptions(commandArguments);
  if (read.error !== undefined) {
    stderr.write(read.error);
    return 2;
  }
  const { preset, config } = rulesPreset(read.options, currentProjectRoot);
  const listed = listedEntries(preset, config, read.options);
  stdout.write(rulesText(preset, listed, read.options.fixable));
  return 0;
}
