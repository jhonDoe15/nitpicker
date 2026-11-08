import { parse } from 'smol-toml';

// The tools whose settings an agent could loosen. A project file such as pyproject.toml also holds
// the name, the dependencies and the build setup, which a task may change.
const PYPROJECT_TOOLS =
  /^(?:ruff|mypy|pyright|basedpyright|coverage|pytest|mutmut|importlinter|black|isort|pylint|flake8|bandit|vulture|pycodestyle)$/u;
const INI_SECTIONS =
  /^(?:tool:pytest|pytest|mypy.*|flake8|coverage(?::.*)?|isort|pycodestyle|importlinter(?::.*)?|pylint.*|mutmut|bandit|ruff.*|pyright)$/iu;
// A pytest option that only tells it where to import from or which markers exist.
const BENIGN_PYTEST_OPTIONS = new Set(['markers', 'pythonpath']);
// Only what a tox environment runs, and only the ktlint and line-length keys of an .editorconfig.
const RUN_ONLY = /^testenv(?::.*)?$/iu;
const EDITORCONFIG_KEYS = /^(?:ktlint[\w-]*|disabled_rules|max_line_length)$/u;

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (value !== null && typeof value === 'object') {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

// Registering a marker is how a test gets `@pytest.mark.integration` under `--strict-markers`.
function withoutMarkers(name, settings) {
  if (name !== 'pytest' || settings.ini_options === undefined) return settings;
  const options = Object.entries(settings.ini_options).filter(
    ([key]) => !BENIGN_PYTEST_OPTIONS.has(key),
  );
  return { ...settings, ini_options: Object.fromEntries(options) };
}

/** `tool.<name>` to its canonical content, for the quality tools in a pyproject.toml. */
function pyprojectSections(text) {
  const tools = parse(text).tool ?? {};
  return new Map(
    Object.keys(tools)
      .filter((name) => PYPROJECT_TOOLS.test(name))
      .map((name) => [`tool.${name}`, canonical(withoutMarkers(name, tools[name]))]),
  );
}

// The `key = value` entries of each section; an indented line continues the previous value.
function iniEntries(text) {
  const sections = new Map();
  let entries;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    const header = /^\[([^\]]+)\]$/u.exec(trimmed);
    if (header !== null) {
      entries = sections.get(header[1]) ?? [];
      sections.set(header[1], entries);
    } else if (entries !== undefined && trimmed !== '' && !/^[#;]/u.test(trimmed)) {
      const last = entries.at(-1);
      if (/^\s/u.test(line) && last !== undefined) last.value += ` ${trimmed}`;
      else entries.push({ key: /^[^=:\s]*/u.exec(trimmed)[0], value: trimmed });
    }
  }
  return sections;
}

const asText = (entries) => entries.map(({ value }) => `${value}\n`).join('');

/** Section name to its entries without blanks and comments, for the quality tools in an ini file. */
function iniSections(text) {
  const sections = new Map();
  for (const [name, entries] of iniEntries(text)) {
    if (/^(?:tool:pytest|pytest)$/iu.test(name)) {
      sections.set(name, asText(entries.filter(({ key }) => !BENIGN_PYTEST_OPTIONS.has(key))));
    } else if (RUN_ONLY.test(name)) {
      sections.set(name, asText(entries.filter(({ key }) => key.startsWith('commands'))));
    } else if (INI_SECTIONS.test(name)) sections.set(name, asText(entries));
  }
  return new Map([...sections].filter(([, content]) => content !== ''));
}

/** Section name to its ktlint and line-length entries, for an .editorconfig. */
function editorconfigSections(text) {
  return new Map(
    [...iniEntries(text)]
      .map(([name, entries]) => [
        name,
        asText(entries.filter(({ key }) => EDITORCONFIG_KEYS.test(key))),
      ])
      .filter(([, content]) => content !== ''),
  );
}

const READERS = new Map([
  ['pyproject.toml', pyprojectSections],
  ['setup.cfg', iniSections],
  ['tox.ini', iniSections],
  ['.editorconfig', editorconfigSections],
]);

export const hasSections = (file) => READERS.has(file.split('/').at(-1));

/**
 * The quality-tool sections of a settings file that differ between two versions of it (a missing
 * file has none). A file that cannot be parsed counts as changed.
 */
export function changedSections(file, before, after) {
  const read = READERS.get(file.split('/').at(-1));
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
