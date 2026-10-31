import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { readFileEntries } from '../../execution/python-project.mjs';
import { toml } from '../../../libraries/project-files.mjs';
import { parseIni } from '../ini-parser.mjs';
import { coverageTestOmits } from '../../execution/python-test-files.mjs';
import { isDjangoProject } from '../pytest/collection-options.mjs';
import { ASSERT_NEVER_ARM } from '../../../ingest/coverage-reports/exhaustive-match.mjs';
import { checkedRunValue, warningNames } from './coverage-values.mjs';
import {
  attempt,
  requireProjectConfig,
  toolLayers,
} from '../../project-tools/project-tool-layers.mjs';

const COVERAGE_CONFIG = 'coveragerc';
export const UNTESTABLE_LINES = [
  String.raw`^\s*if (typing\.)?TYPE_CHECKING:`,
  String.raw`^\s*if __name__ == .__main__.:`,
  String.raw`^\s*@(typing\.)?overload\b`,
  String.raw`^\s*raise NotImplementedError\b`,
  [
    String.raw`^[ \t]*(?:async[ \t]+)?def[ \t]+\w+[ \t]*(?:\[[^\]\n]*\])?[ \t]*`,
    String.raw`\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)[ \t]*(?:->[^:]+)?:[ \t]*\.\.\.[ \t]*(?:#.*)?$`,
  ].join(''),
  ASSERT_NEVER_ARM,
];
const CARRIED_KEYS = ['concurrency', 'patch', 'plugins'];
const OPTED_RUN_KEYS = [
  'timid',
  'cover_pylib',
  'dynamic_context',
  'sigterm',
  'disable_warnings',
  'core',
];
const LIST_RUN_KEYS = new Set(['disable_warnings']);
const OMIT = 'omit';
const EXCLUDED_LINE_KEYS = ['exclude_lines', 'exclude_also'];
const PARTIAL_BRANCH_KEYS = ['partial_branches', 'partial_also'];
export const COVERAGE_TOOL = 'coverage';
const LOOKED =
  'a coverage config (.coveragerc, or setup.cfg or tox.ini with a [coverage:run] or [coverage:report] section, or pyproject.toml with a [tool.coverage] table)';
const PROJECT_FILES = [
  { name: '.coveragerc', prefixes: ['coverage:', ''], label: '.coveragerc' },
  { name: 'setup.cfg', prefixes: ['coverage:'], label: '[coverage:*] in setup.cfg' },
  { name: 'tox.ini', prefixes: ['coverage:'], label: '[coverage:*] in tox.ini' },
  { name: 'pyproject.toml', prefixes: [], label: '[tool.coverage] in pyproject.toml' },
];
const WILDCARD_START = /^[*?]/;

function listValue(value) {
  return [value]
    .flat()
    .flatMap((entry) => String(entry).split(/[,\n]/))
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

function iniSettings(text, { name, prefixes }) {
  const sections = parseIni(text);
  const ownsFile = name === '.coveragerc';
  const hasCoverage = [...sections.keys()].some((section) => section.startsWith('coverage:'));
  if (!ownsFile && !hasCoverage) {
    return undefined;
  }
  return {
    run: iniSection(sections, prefixes, 'run'),
    report: iniSection(sections, prefixes, 'report'),
  };
}

function iniSection(sections, prefixes, kind) {
  return Object.fromEntries(
    prefixes.map((prefix) => sections.get(`${prefix}${kind}`)).find(Boolean) ?? [],
  );
}

function tomlSettings(text) {
  const coverage = toml().parse(text).tool?.coverage;
  return coverage === undefined
    ? undefined
    : { run: coverage.run ?? {}, report: coverage.report ?? {} };
}

function settingsOf([name, text]) {
  const candidate = PROJECT_FILES.find((file) => file.name === name);
  const { value, error } = attempt(() =>
    candidate.prefixes.length === 0 ? tomlSettings(text) : iniSettings(text, candidate),
  );
  if (error !== undefined) {
    throw Object.assign(new Error(`${name}: ${error.message}`, { cause: error }), { file: name });
  }
  return value === undefined ? undefined : { label: candidate.label, ...value };
}

function absoluteOmits(projectRoot, value) {
  return listValue(value ?? []).map((pattern) =>
    WILDCARD_START.test(pattern) || path.isAbsolute(pattern)
      ? pattern
      : path.join(projectRoot, pattern),
  );
}

export function readCoverageSettings(root) {
  const names = PROJECT_FILES.map(({ name }) => name);
  for (const [name, text] of readFileEntries(root, names)) {
    const settings = settingsOf([name, text]);
    if (settings !== undefined) {
      return { file: name, ...settings };
    }
  }
  return undefined;
}

export function optInKeys({ run, report }) {
  return [
    ...[...OPTED_RUN_KEYS, OMIT].filter((key) => run[key] !== undefined),
    ...[...EXCLUDED_LINE_KEYS, ...PARTIAL_BRANCH_KEYS, OMIT].filter(
      (key) => report[key] !== undefined,
    ),
  ];
}

function carriedOf({ run = {} }) {
  return Object.fromEntries(
    CARRIED_KEYS.map((key) => [key, listValue(run[key] ?? [])]).filter(
      ([, values]) => values.length > 0,
    ),
  );
}

export function readProjectCoverage(configRoot) {
  return carriedOf(readCoverageSettings(configRoot) ?? {});
}

function regexList(value) {
  return [value]
    .flat()
    .flatMap((entry) => String(entry).split('\n'))
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

function runValue(file, key, value) {
  return LIST_RUN_KEYS.has(key)
    ? warningNames(file, listValue(value))
    : checkedRunValue(file, key, value);
}

function projectSettings(context) {
  const layers = toolLayers(context, COVERAGE_TOOL);
  const { value, error } = attempt(() => readCoverageSettings(layers.configRoot));
  if (!layers.optedIn) {
    if (error !== undefined) {
      throw new Error(`The coverage config could not be parsed (${error.message}): fix it`, {
        cause: error,
      });
    }
    return { layers, found: value };
  }
  const found = requireProjectConfig(
    error === undefined
      ? value
      : { file: error.file ?? 'pyproject.toml', unreadable: error.message },
    { tool: COVERAGE_TOOL, looked: LOOKED, configRoot: layers.configRoot },
  );
  return { layers, found };
}

function optedSettings({ layers, found }, projectRoot) {
  if (!layers.optedIn) {
    return { run: [], excluded: [], partial: [], omit: [], reportOmit: [] };
  }
  const { file, run, report } = found;
  function listed(keys) {
    return layers.nitpickerFirst ? [] : keys.flatMap((key) => regexList(report[key] ?? []));
  }
  function omits(value) {
    return layers.nitpickerFirst ? [] : absoluteOmits(projectRoot, value);
  }
  return {
    run: OPTED_RUN_KEYS.filter((key) => run[key] !== undefined).map((key) => [
      key,
      runValue(file, key, run[key]),
    ]),
    excluded: listed(EXCLUDED_LINE_KEYS),
    partial: listed(PARTIAL_BRANCH_KEYS),
    omit: omits(run.omit),
    reportOmit: omits(report.omit),
  };
}

function indented(entries) {
  return entries.map((entry) => `    ${entry}`).join('\n');
}

function listSetting(key, values) {
  return values.length === 0 ? `${key} =` : `${key} =\n${indented(values)}`;
}

function coverageConfig(context, sources) {
  const { projectRoot } = context;
  const settings = projectSettings(context);
  const run = carriedOf(settings.found ?? {});
  const opted = optedSettings(settings, projectRoot);
  const { omit, reportOmit } = opted;
  return [
    '[run]',
    'branch = True',
    'parallel = False',
    `source =\n${indented(sources.map((source) => path.join(projectRoot, source)))}`,
    `omit =\n${indented([
      ...absoluteOmits(projectRoot, coverageTestOmits(isDjangoProject(projectRoot))),
      ...omit,
    ])}`,
    ...Object.entries(run).map(([key, values]) => `${key} =\n${indented(values)}`),
    ...opted.run.map(([key, value]) =>
      Array.isArray(value) ? listSetting(key, value) : `${key} = ${value}`,
    ),
    '[report]',
    ...(reportOmit.length === 0 ? [] : [`omit =\n${indented(reportOmit)}`]),
    listSetting('exclude_lines', [...new Set([...UNTESTABLE_LINES, ...opted.excluded])]),
    listSetting('partial_branches', [...new Set(opted.partial)]),
    '',
  ].join('\n');
}

export function writeCoverageConfig(context, sources) {
  const config = path.join(context.reportRoot, COVERAGE_CONFIG);
  writeFileSync(config, coverageConfig(context, sources));
  return config;
}
