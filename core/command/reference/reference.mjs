import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE_NAME, configError } from '../../../shared/config.mjs';
import { PRESET_TITLES, PRESETS } from '../../../shared/reference/entry.mjs';
import { entryFacts, entryLinks, linkUrl, plainText } from '../../../shared/reference/facts.mjs';
import {
  closestIds,
  indexEntries,
  lookupEntries,
  readReferenceEntries,
  referenceUrl,
} from '../../../shared/reference/store.mjs';
import { applyDisable, readConfigFile } from '../../configuration/config.mjs';
import { presetAnalyzers } from '../../configuration/preset-analyzers.mjs';
import { chainOf } from '../../../shared/traversal.mjs';
import { docsRootUrl, docsUrl } from '../../../shared/messages/docs-url.mjs';

const EXPLAIN_USAGE = 'Usage: nitpicker explain <tool/rule>...\n';
const RULES_USAGE = `Usage: nitpicker rules [--preset <${PRESETS.join('|')}>] [--tool <name>]\n`;
const DEFAULT_PRESET = 'typescript';
const FIRST_SENTENCE = /^.*?[.!?](?=\s|$)/su;
const INDENT = '  ';
const CHECKS_PAGE = 'checks';
const CHECKS_CATALOG = 'spec/checks.md';
const CATEGORY_ANCHOR = 'quality-area-checks';

function factLines({ label, text, items, code }, root) {
  if (code !== undefined) {
    return [`${label}:`, ...code.split('\n').map((line) => `${INDENT}${line}`)];
  }
  return items === undefined
    ? [`${label}: ${plainText(text, root)}`]
    : [`${label}:`, ...items.map((item) => `${INDENT}- ${plainText(item, root)}`)];
}

function urlLines(label, url) {
  return url === undefined ? [] : [`${label}: ${url}`];
}

function explainText(entry, root) {
  return [
    entry.id,
    plainText(entry.summary, root),
    '',
    ...entryFacts(entry).flatMap((fact) => factLines(fact, root)),
    ...entryLinks(entry).flatMap((link) => urlLines(link.label, linkUrl(link, root))),
    ...urlLines('Reference', referenceUrl(entry, root)),
    '',
  ].join('\n');
}

function categoryText(name, rules, root) {
  return [
    name,
    'A check nitpicker runs itself. Its rules (nitpicker explain <rule> describes one):',
    ...rules.map((entry) => `${INDENT}${summaryLine(entry, root)}`),
    ...urlLines('Checks catalog', docsUrl(CHECKS_CATALOG, CATEGORY_ANCHOR, root)),
    '',
  ].join('\n');
}

function explained({ index, root }, name) {
  const found = lookupEntries(index, name);
  if (found.length > 0) {
    return found.map((entry) => explainText(entry, root));
  }
  const rules = index.entries.filter((entry) => entry.page === CHECKS_PAGE && entry.tool === name);
  return rules.length === 0 ? [] : [categoryText(name, rules, root)];
}

/** Runs `nitpicker explain`: prints the entries of each rule named, or the closest names and fails. */
export function runExplainCommand({ commandArguments, stdout, stderr }) {
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
  const reference = { index: indexEntries(readReferenceEntries()), root: docsRootUrl() };
  const index = reference.index;
  const texts = new Map(commandArguments.map((name) => [name, explained(reference, name)]));
  const unknown = commandArguments.filter((name) => texts.get(name).length === 0);
  stdout.write([...texts.values()].flat().join('\n'));
  for (const name of unknown) {
    const closest = closestIds(index, name);
    stderr.write(
      `nitpicker: unknown rule "${name}".${closest.length === 0 ? '' : ` Closest: ${closest.join(', ')}.`} ` +
        'Run nitpicker rules to list the rules.\n',
    );
  }
  return unknown.length === 0 ? 0 : 1;
}

const RULES_OPTIONS = { '--preset': 'preset', '--tool': 'tool' };

function splitOption(argument) {
  const equals = argument.indexOf('=');
  return equals === -1
    ? [argument, undefined]
    : [argument.slice(0, equals), argument.slice(equals + 1)];
}

function readRulesOptions(commandArguments) {
  const options = {};
  const remaining = commandArguments.values();
  for (const argument of remaining) {
    const [flag, inline] = splitOption(argument);
    const property = RULES_OPTIONS[flag];
    if (property === undefined) {
      return { error: RULES_USAGE };
    }
    const value = inline ?? remaining.next().value;
    if (value === undefined || value === '' || value.startsWith('--')) {
      return { error: `nitpicker: ${flag} requires a value.\n${RULES_USAGE}` };
    }
    options[property] = value;
  }
  if (options.preset !== undefined && !PRESETS.includes(options.preset)) {
    return {
      error: `nitpicker: --preset got "${options.preset}". Presets: ${PRESETS.join(', ')}.\n${RULES_USAGE}`,
    };
  }
  return { options };
}

function configRootFrom(start) {
  const directories = chainOf(start, (directory) => {
    const parent = path.dirname(directory);
    return parent === directory ? undefined : parent;
  });
  return directories.find((directory) => existsSync(path.join(directory, CONFIG_FILE_NAME)));
}

function enabledAnalyzers(preset, config) {
  const analyzers = presetAnalyzers({ ...config, preset });
  const configured = config.preset === preset ? config : {};
  return new Set(applyDisable(analyzers, configured).map(({ name }) => name));
}

function reportsFor(names, enabled) {
  return names !== undefined && (names.length === 0 || names.some((name) => enabled.has(name)));
}

function summaryLine(entry, root) {
  const sentence = FIRST_SENTENCE.exec(entry.summary)?.[0] ?? entry.summary;
  return `${entry.id}  ${plainText(sentence.replaceAll(/\s+/gu, ' '), root)}`;
}

function listedEntries(preset, config, tool) {
  const enabled = enabledAnalyzers(preset, config);
  return readReferenceEntries()
    .filter(({ analyzers }) => reportsFor(analyzers[preset], enabled))
    .filter(
      (entry) => tool === undefined || [entry.tool, ...(entry.findingTools ?? [])].includes(tool),
    );
}

/** Runs `nitpicker rules`: lists the rules the preset of the project reports, minus disabled analyzers. */
export function runRulesCommand({ commandArguments, stdout, stderr, currentProjectRoot }) {
  if (commandArguments.includes('--help')) {
    stdout.write(RULES_USAGE);
    return 0;
  }
  const { options, error } = readRulesOptions(commandArguments);
  if (error !== undefined) {
    stderr.write(error);
    return 2;
  }
  const configRoot = configRootFrom(realpathSync(currentProjectRoot ?? process.cwd()));
  const config = configRoot === undefined ? {} : readConfigFile(configRoot);
  const preset = options.preset ?? config.preset ?? DEFAULT_PRESET;
  if (!PRESETS.includes(preset)) {
    throw configError(`unknown preset "${preset}". Presets: ${PRESETS.join(', ')}`);
  }
  const listed = listedEntries(preset, config, options.tool);
  const root = docsRootUrl();
  stdout.write(
    `${PRESET_TITLES[preset]} preset: ${String(listed.length)} rules. ` +
      'nitpicker explain <tool/rule> describes one.\n' +
      listed.map((entry) => `${summaryLine(entry, root)}\n`).join(''),
  );
  return 0;
}
