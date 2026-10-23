import { parse } from 'smol-toml';

// The tools whose settings an agent could loosen. A project file such as pyproject.toml also holds
// the name, the dependencies and the build setup, which a task may change.
const PYPROJECT_TOOLS =
  /^(?:ruff|mypy|pyright|basedpyright|coverage|pytest|mutmut|importlinter|black|isort|pylint|flake8|bandit|vulture|pycodestyle)$/u;
const INI_SECTIONS =
  /^(?:tool:pytest|pytest|mypy.*|flake8|coverage(?::.*)?|isort|pycodestyle|importlinter(?::.*)?|pylint.*|mutmut|bandit|ruff.*|pyright)$/iu;

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
  const options = Object.entries(settings.ini_options).filter(([key]) => key !== 'markers');
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

/** Section name to its lines without blanks and comments, for the quality tools in an ini file. */
function iniSections(text) {
  const sections = new Map();
  let current;
  for (const line of text.split('\n').map((candidate) => candidate.trim())) {
    const header = /^\[([^\]]+)\]$/u.exec(line);
    if (header !== null) current = header[1];
    else if (current !== undefined && line !== '' && !/^[#;]/u.test(line)) {
      sections.set(current, `${sections.get(current) ?? ''}${line}\n`);
    }
  }
  return new Map([...sections].filter(([name]) => INI_SECTIONS.test(name)));
}

const READERS = new Map([
  ['pyproject.toml', pyprojectSections],
  ['setup.cfg', iniSections],
  ['tox.ini', iniSections],
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
