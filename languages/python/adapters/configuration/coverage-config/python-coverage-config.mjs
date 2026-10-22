import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { readFileEntries } from '../../execution/python-project.mjs';
import { toml } from '../../../libraries/project-files.mjs';
import { parseIni } from '../ini-parser.mjs';
import { coverageTestOmits } from '../../execution/python-test-files.mjs';
import { isDjangoProject } from '../pytest/collection-options.mjs';

const COVERAGE_CONFIG = 'coveragerc';
const UNTESTABLE_LINES = [
  String.raw`^\s*if (typing\.)?TYPE_CHECKING:`,
  String.raw`^\s*if __name__ == .__main__.:`,
  String.raw`^\s*@(typing\.)?overload\b`,
  String.raw`^\s*raise NotImplementedError\b`,
];
const CARRIED_KEYS = ['concurrency', 'patch', 'plugins'];
const PROJECT_FILES = [
  { name: '.coveragerc', prefixes: ['coverage:', ''] },
  { name: 'setup.cfg', prefixes: ['coverage:'] },
  { name: 'tox.ini', prefixes: ['coverage:'] },
  { name: 'pyproject.toml', prefixes: [] },
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
  return candidate.prefixes.length === 0 ? tomlSettings(text) : iniSettings(text, candidate);
}

function absoluteOmits(projectRoot, value) {
  return listValue(value ?? []).map((pattern) =>
    WILDCARD_START.test(pattern) || path.isAbsolute(pattern)
      ? pattern
      : path.join(projectRoot, pattern),
  );
}

export function readProjectCoverage(projectRoot) {
  const { run = {}, report = {} } =
    readFileEntries(
      projectRoot,
      PROJECT_FILES.map(({ name }) => name),
    )
      .map(settingsOf)
      .find((found) => found !== undefined) ?? {};
  const carried = CARRIED_KEYS.map((key) => [key, listValue(run[key] ?? [])]).filter(
    ([, values]) => values.length > 0,
  );
  return {
    run: Object.fromEntries(carried),
    omit: absoluteOmits(projectRoot, run.omit),
    reportOmit: absoluteOmits(projectRoot, report.omit),
  };
}

function indented(entries) {
  return entries.map((entry) => `    ${entry}`).join('\n');
}

function coverageConfig(projectRoot, sources) {
  const { run, omit, reportOmit } = readProjectCoverage(projectRoot);
  return [
    '[run]',
    'branch = True',
    'parallel = False',
    `source =\n${indented(sources.map((source) => path.join(projectRoot, source)))}`,
    `omit =\n${indented([...coverageTestOmits(isDjangoProject(projectRoot)), ...omit])}`,
    ...Object.entries(run).map(([key, values]) => `${key} =\n${indented(values)}`),
    '[report]',
    ...(reportOmit.length === 0 ? [] : [`omit =\n${indented(reportOmit)}`]),
    `exclude_lines =\n${indented(UNTESTABLE_LINES)}`,
    'partial_branches =',
    '',
  ].join('\n');
}

export function writeCoverageConfig({ projectRoot, reportRoot }, sources) {
  const config = path.join(reportRoot, COVERAGE_CONFIG);
  writeFileSync(config, coverageConfig(projectRoot, sources));
  return config;
}
