import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { readFileEntries } from '../../execution/python-project.mts';
import { parseIni, type IniSections } from '../ini-parser.mts';
import {
  fieldOf,
  fieldsOf,
  messageOf,
  textOf,
  type Fields,
} from '../../../../../shared/values/readers.mts';
import type {
  CoverageContext,
  CoverageProjectFile,
  CoverageSections,
  CoverageSettings,
  FoundCoverage,
  OptedSettings,
  UnreadableCoverage,
} from '../typed/coverage-types.mts';
import { coverageTestOmits } from '../../execution/python-test-files.mts';
import { isDjangoProject } from '../pytest/collection-options.mts';
import { ASSERT_NEVER_ARM } from '../../../ingest/coverage-reports/exhaustive-match.mts';
import { checkedRunValue, warningNames } from './coverage-values.mts';
import {
  attempt,
  parseToml,
  requireProjectConfig,
  toolLayers,
} from '../../project-tools/project-tool-layers.mts';
import type { ToolLayers } from '../../project-tools/typed/tool-types.mts';

const COVERAGE_CONFIG = 'coveragerc';
const SECTION_PREFIX = 'coverage:';
const COVERAGERC = '.coveragerc';
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
const PROJECT_FILES: readonly CoverageProjectFile[] = [
  { name: COVERAGERC, prefixes: [SECTION_PREFIX, ''], label: COVERAGERC },
  { name: 'setup.cfg', prefixes: [SECTION_PREFIX], label: '[coverage:*] in setup.cfg' },
  { name: 'tox.ini', prefixes: [SECTION_PREFIX], label: '[coverage:*] in tox.ini' },
  { name: 'pyproject.toml', prefixes: [], label: '[tool.coverage] in pyproject.toml' },
];
const WILDCARD_START = /^[*?]/;

function listValue(value: unknown): string[] {
  return [value]
    .flat()
    .flatMap((entry) => textOf(entry).split(/[,\n]/))
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

function iniSettings(
  text: string,
  { name, prefixes }: CoverageProjectFile,
): CoverageSections | undefined {
  const sections = parseIni(text);
  const ownsFile = name === COVERAGERC;
  const hasCoverage = [...sections.keys()].some((section) => section.startsWith(SECTION_PREFIX));
  if (!(ownsFile || hasCoverage)) {
    return undefined;
  }
  return {
    run: iniSection(sections, prefixes, 'run'),
    report: iniSection(sections, prefixes, 'report'),
  };
}

function iniSection(sections: IniSections, prefixes: readonly string[], kind: string): Fields {
  return Object.fromEntries(
    prefixes.map((prefix) => sections.get(`${prefix}${kind}`)).find(Boolean) ?? [],
  );
}

function tomlSettings(text: string): CoverageSections | undefined {
  const coverage = fieldOf(fieldOf(parseToml(text), 'tool'), 'coverage');
  return coverage === undefined
    ? undefined
    : {
        run: fieldsOf(fieldOf(coverage, 'run')),
        report: fieldsOf(fieldOf(coverage, 'report')),
      };
}

function settingsOf([name, text]: readonly [string, string]): CoverageSettings | undefined {
  const candidate = PROJECT_FILES.find((file) => file.name === name);
  if (candidate === undefined) {
    return undefined;
  }
  const { value, error } = attempt(() =>
    candidate.prefixes.length === 0 ? tomlSettings(text) : iniSettings(text, candidate),
  );
  if (error !== undefined) {
    throw Object.assign(new Error(`${name}: ${messageOf(error)}`, { cause: error }), {
      file: name,
    });
  }
  return value === undefined ? undefined : { label: candidate.label, ...value };
}

function absoluteOmits(projectRoot: string, value: unknown): string[] {
  return listValue(value ?? []).map((pattern) =>
    WILDCARD_START.test(pattern) || path.isAbsolute(pattern)
      ? pattern
      : path.join(projectRoot, pattern),
  );
}

export function readCoverageSettings(root: string): FoundCoverage | undefined {
  const names = PROJECT_FILES.map(({ name }) => name);
  for (const [name, text] of readFileEntries(root, names)) {
    const settings = settingsOf([name, text]);
    if (settings !== undefined) {
      return { file: name, ...settings };
    }
  }
  return undefined;
}

export function optInKeys({ run, report }: CoverageSections): string[] {
  return [
    ...[...OPTED_RUN_KEYS, OMIT].filter((key) => run[key] !== undefined),
    ...[...EXCLUDED_LINE_KEYS, ...PARTIAL_BRANCH_KEYS, OMIT].filter(
      (key) => report[key] !== undefined,
    ),
  ];
}

function carriedOf({ run = {} }: Partial<CoverageSections>): Record<string, string[]> {
  return Object.fromEntries(
    CARRIED_KEYS.map((key): [string, string[]] => [key, listValue(run[key] ?? [])]).filter(
      ([, values]) => values.length > 0,
    ),
  );
}

export function readProjectCoverage(configRoot: string): Record<string, string[]> {
  return carriedOf(readCoverageSettings(configRoot) ?? {});
}

function regexList(value: unknown): string[] {
  return [value]
    .flat()
    .flatMap((entry) => textOf(entry).split('\n'))
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

function runValue(file: string, key: string, value: unknown): string | string[] {
  return LIST_RUN_KEYS.has(key)
    ? warningNames(file, listValue(value))
    : checkedRunValue(file, key, value);
}

function projectSettings(context: CoverageContext): {
  layers: ToolLayers;
  found: FoundCoverage | undefined;
} {
  const layers = toolLayers(
    {
      projectRoot: context.projectRoot,
      policyRoot: context.policyRoot,
      toolPrecedence: context.toolPrecedence,
    },
    COVERAGE_TOOL,
  );
  const { value, error } = attempt(() => readCoverageSettings(layers.configRoot));
  if (!layers.optedIn) {
    if (error !== undefined) {
      throw new Error(`The coverage config could not be parsed (${messageOf(error)}): fix it`, {
        cause: error,
      });
    }
    return { layers, found: value };
  }
  const errorFile = fieldOf(error, 'file');
  const unreadable: UnreadableCoverage | undefined =
    error === undefined
      ? undefined
      : {
          file: typeof errorFile === 'string' ? errorFile : 'pyproject.toml',
          unreadable: messageOf(error),
        };
  const found = requireProjectConfig(unreadable ?? value, {
    tool: COVERAGE_TOOL,
    looked: LOOKED,
    configRoot: layers.configRoot,
  });
  return { layers, found: 'run' in found ? found : undefined };
}

function optedSettings(
  { layers, found }: { layers: ToolLayers; found: FoundCoverage | undefined },
  projectRoot: string,
): OptedSettings {
  if (!layers.optedIn || found === undefined) {
    return { run: [], excluded: [], partial: [], omit: [], reportOmit: [] };
  }
  const { file, run, report } = found;
  function listed(keys: readonly string[]): string[] {
    return layers.nitpickerFirst ? [] : keys.flatMap((key) => regexList(report[key] ?? []));
  }
  function omits(value: unknown): string[] {
    return layers.nitpickerFirst ? [] : absoluteOmits(projectRoot, value);
  }
  return {
    run: OPTED_RUN_KEYS.filter((key) => run[key] !== undefined).map(
      (key): [string, string | string[]] => [key, runValue(file, key, run[key])],
    ),
    excluded: listed(EXCLUDED_LINE_KEYS),
    partial: listed(PARTIAL_BRANCH_KEYS),
    omit: omits(run['omit']),
    reportOmit: omits(report['omit']),
  };
}

function indented(entries: readonly string[]): string {
  return entries.map((entry) => `    ${entry}`).join('\n');
}

function listSetting(key: string, values: readonly string[]): string {
  return values.length === 0 ? `${key} =` : `${key} =\n${indented(values)}`;
}

function coverageConfig(context: CoverageContext, sources: readonly string[]): string {
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
      ...absoluteOmits(projectRoot, coverageTestOmits({ django: isDjangoProject(projectRoot) })),
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

export function writeCoverageConfig(context: CoverageContext, sources: readonly string[]): string {
  const config = path.join(context.reportRoot, COVERAGE_CONFIG);
  writeFileSync(config, coverageConfig(context, sources));
  return config;
}
