import { parse } from 'smol-toml';
import { fieldsOf, requiredFields } from '../../../../scripts/json/fields.mts';
import { capture } from '../../common/matches.mts';

const PYPROJECT_TOOLS = new RegExp(
  [
    String.raw`^(?:ruff|mypy|pyright|basedpyright|coverage|pytest|mutmut|importlinter|`,
    String.raw`black|isort|pylint|flake8|bandit|vulture|pycodestyle)$`,
  ].join(''),
  'u',
);
const INI_SECTIONS = new RegExp(
  [
    String.raw`^(?:tool:pytest|pytest|mypy.*|flake8|coverage(?::.*)?|isort|`,
    String.raw`pycodestyle|importlinter(?::.*)?|pylint.*|mutmut|bandit|ruff.*|`,
    String.raw`pyright)$`,
  ].join(''),
  'iu',
);
const BENIGN_PYTEST_OPTIONS = new Set(['markers', 'pythonpath']);
const RUN_ONLY = /^testenv(?::.*)?$/iu;
const EDITORCONFIG_KEYS = /^(?:ktlint[\w-]*|disabled_rules|max_line_length)$/u;

type Sections = Map<string, string>;

type IniEntry = { key: string; value: string };

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  const fields = fieldsOf(value);
  if (fields !== undefined) {
    const entries = Object.keys(fields)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(fields[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function withoutMarkers(name: string, settings: unknown): unknown {
  const fields = fieldsOf(settings);
  const iniOptions = fields?.['ini_options'];
  if (fields === undefined || name !== 'pytest' || iniOptions === undefined) return settings;
  const options = Object.entries(requiredFields(iniOptions, 'pytest ini_options')).filter(
    ([key]) => !BENIGN_PYTEST_OPTIONS.has(key),
  );
  return { ...fields, ini_options: Object.fromEntries(options) };
}

function pyprojectSections(text: string): Sections {
  const tools = fieldsOf(parse(text)['tool']) ?? {};
  return new Map(
    Object.keys(tools)
      .filter((name) => PYPROJECT_TOOLS.test(name))
      .map((name): [string, string] => [
        `tool.${name}`,
        canonical(withoutMarkers(name, tools[name])),
      ]),
  );
}

function iniEntries(text: string): Map<string, IniEntry[]> {
  const sections = new Map<string, IniEntry[]>();
  let entries: IniEntry[] | undefined;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    const header = /^\[([^\]]+)\]$/u.exec(trimmed);
    if (header !== null) {
      entries = sections.get(capture(header, 1)) ?? [];
      sections.set(capture(header, 1), entries);
    } else if (entries !== undefined && trimmed !== '' && !/^[#;]/u.test(trimmed)) {
      const last = entries.at(-1);
      if (/^\s/u.test(line) && last !== undefined) last.value += ` ${trimmed}`;
      else entries.push({ key: /^[^=:\s]*/u.exec(trimmed)?.[0] ?? '', value: trimmed });
    }
  }
  return sections;
}

function asText(entries: readonly IniEntry[]): string {
  return entries.map(({ value }) => `${value}\n`).join('');
}

function iniSections(text: string): Sections {
  const sections: Sections = new Map();
  for (const [name, entries] of iniEntries(text)) {
    if (/^(?:tool:pytest|pytest)$/iu.test(name)) {
      sections.set(name, asText(entries.filter(({ key }) => !BENIGN_PYTEST_OPTIONS.has(key))));
    } else if (RUN_ONLY.test(name)) {
      sections.set(name, asText(entries.filter(({ key }) => key.startsWith('commands'))));
    } else if (INI_SECTIONS.test(name)) sections.set(name, asText(entries));
  }
  return new Map([...sections].filter(([, content]) => content !== ''));
}

function editorconfigSections(text: string): Sections {
  return new Map(
    [...iniEntries(text)]
      .map(([name, entries]): [string, string] => [
        name,
        asText(entries.filter(({ key }) => EDITORCONFIG_KEYS.test(key))),
      ])
      .filter(([, content]) => content !== ''),
  );
}

const READERS = new Map<string, (text: string) => Sections>([
  ['pyproject.toml', pyprojectSections],
  ['setup.cfg', iniSections],
  ['tox.ini', iniSections],
  ['.editorconfig', editorconfigSections],
]);

export function hasSections(file: string): boolean {
  return READERS.has(file.split('/').at(-1) ?? '');
}

export function changedSections(
  file: string,
  before: string | undefined,
  after: string | undefined,
): string[] {
  const read = READERS.get(file.split('/').at(-1) ?? '');
  if (read === undefined) return ['unparseable file'];
  try {
    const left = read(before ?? '');
    const right = read(after ?? '');
    return [...new Set([...left.keys(), ...right.keys()])].filter(
      (name) => left.get(name) !== right.get(name),
    );
  } catch {
    return ['unparseable file'];
  }
}
