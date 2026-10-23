import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE_NAME, configError } from '../../../shared/config.mjs';
import { PRESET_TITLES, PRESETS } from '../../../shared/reference/entry.mjs';
import { entryFacts, entryLinks, linkUrl } from '../../../shared/reference/facts.mjs';
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

const EXPLAIN_USAGE = 'Usage: nitpicker explain <tool/rule>...\n';
const RULES_USAGE = `Usage: nitpicker rules [--preset <${PRESETS.join('|')}>] [--tool <name>]\n`;
const DEFAULT_PRESET = 'typescript';
const FIRST_SENTENCE = /^.*?[.!?](?=\s|$)/su;
const INDENT = '  ';

function factLines({ label, text, items }) {
  return items === undefined
    ? [`${label}: ${text}`]
    : [`${label}:`, ...items.map((item) => `${INDENT}- ${item}`)];
}

function linkLine(link) {
  return `${link.label}: ${linkUrl(link)}`;
}

function explainText(entry) {
  return [
    entry.id,
    entry.summary,
    '',
    ...entryFacts(entry).flatMap(factLines),
    ...entryLinks(entry).map(linkLine),
    `Reference: ${referenceUrl(entry)}`,
    '',
  ].join('\n');
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
  const entries = readReferenceEntries();
  const index = indexEntries(entries);
  const unknown = commandArguments.filter((name) => lookupEntries(index, name).length === 0);
  const known = commandArguments.filter((argument) => !unknown.includes(argument));
  stdout.write(known.flatMap((name) => lookupEntries(index, name).map(explainText)).join('\n'));
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

function readRulesOptions(commandArguments) {
  const options = {};
  const remaining = commandArguments.values();
  for (const argument of remaining) {
    const property = RULES_OPTIONS[argument];
    if (property === undefined) {
      return { error: RULES_USAGE };
    }
    const value = remaining.next().value;
    if (value === undefined || value.startsWith('--')) {
      return { error: `nitpicker: ${argument} requires a value.\n${RULES_USAGE}` };
    }
    options[property] = value;
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

function summaryLine(entry) {
  const sentence = FIRST_SENTENCE.exec(entry.summary)?.[0] ?? entry.summary;
  return `${entry.id}  ${sentence.replaceAll(/\s+/gu, ' ')}`;
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
  stdout.write(
    `${PRESET_TITLES[preset]} preset: ${String(listed.length)} rules. ` +
      'nitpicker explain <tool/rule> describes one.\n' +
      listed.map((entry) => `${summaryLine(entry)}\n`).join(''),
  );
  return 0;
}
