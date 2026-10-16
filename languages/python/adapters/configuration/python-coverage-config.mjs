import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseIni, toml } from './mypy-config.mjs';

const COVERAGE_CONFIG = 'coveragerc';
const UNTESTABLE_LINES = [
  String.raw`^\s*if (typing\.)?TYPE_CHECKING:`,
  String.raw`^\s*if __name__ == .__main__.:`,
  String.raw`^\s*@(typing\.)?overload\b`,
  String.raw`^\s*raise NotImplementedError\b`,
];
const TEST_FILES = [
  '*/test_*.py',
  '*_test.py',
  '*/tests.py',
  '*/conftest.py',
  '*/tests/*',
  '*/test/*',
];
const CARRIED_KEYS = ['concurrency', 'patch', 'plugins'];
const PROJECT_FILES = [
  { name: '.coveragerc', prefixes: ['coverage:', ''] },
  { name: 'setup.cfg', prefixes: ['coverage:'] },
  { name: 'tox.ini', prefixes: ['coverage:'] },
  { name: 'pyproject.toml', prefixes: [] },
];

function listValue(value) {
  return [value]
    .flat()
    .flatMap((entry) => String(entry).split(/[,\n]/))
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

function iniRunSection(text, { name, prefixes }) {
  const sections = parseIni(text);
  const ownsFile = name === '.coveragerc';
  const hasCoverage = [...sections.keys()].some((section) => section.startsWith('coverage:'));
  if (!ownsFile && !hasCoverage) {
    return undefined;
  }
  const found = prefixes.map((prefix) => sections.get(`${prefix}run`)).find(Boolean);
  return Object.fromEntries(found ?? []);
}

function tomlRunSection(text) {
  const coverage = toml().parse(text).tool?.coverage;
  return coverage === undefined ? undefined : (coverage.run ?? {});
}

function readRunSection(projectRoot, candidate) {
  const root = path.resolve(projectRoot);
  const file = path.resolve(root, candidate.name);
  if (!file.startsWith(root + path.sep)) {
    return undefined;
  }
  const text = existsSync(file) ? readFileSync(file, 'utf8') : undefined;
  if (text === undefined) {
    return undefined;
  }
  return candidate.prefixes.length === 0 ? tomlRunSection(text) : iniRunSection(text, candidate);
}

export function readProjectCoverageRun(projectRoot) {
  const section =
    PROJECT_FILES.map((candidate) => readRunSection(projectRoot, candidate)).find(
      (found) => found !== undefined,
    ) ?? {};
  return Object.fromEntries(
    [...CARRIED_KEYS, 'omit']
      .map((key) => [key, listValue(section[key] ?? [])])
      .filter(([, values]) => values.length > 0),
  );
}

function indented(entries) {
  return entries.map((entry) => `    ${entry}`).join('\n');
}

function coverageConfig(projectRoot, sources) {
  const { omit = [], ...carried } = readProjectCoverageRun(projectRoot);
  return [
    '[run]',
    'branch = True',
    'parallel = False',
    `source =\n${indented(sources)}`,
    `omit =\n${indented([...TEST_FILES, ...omit])}`,
    ...Object.entries(carried).map(([key, values]) => `${key} =\n${indented(values)}`),
    '[report]',
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
