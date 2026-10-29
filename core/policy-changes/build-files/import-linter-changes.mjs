import { shownSetting } from '../loosenings.mjs';

const KIND = 'tool-config';
const NEUTRAL = new Set(['name', 'cache_dir']);
const NARROWED_BY_REMOVAL = new Set([
  'containers',
  'source_modules',
  'forbidden_modules',
  'modules',
  'protected_modules',
  'root_packages',
]);
const WIDENED_BY_ADDITION = new Set(['ignore_imports', 'allowed_importers', 'exhaustive_ignores']);
const ALERTING = ['none', 'warn', 'error'];
const LOOSENED_WHEN_ON = new Set(['allow_indirect_imports', 'exclude_type_checking_imports']);
const LOOSENED_WHEN_OFF = { exhaustive: false, as_packages: true };

function listOf(value) {
  return [value ?? []].flat();
}

function isOn(value, fallback) {
  return value === undefined ? fallback : String(value).trim().toLowerCase() === 'true';
}

function keepsOrder(before, after) {
  const matched = after.reduce(
    (position, value) => position + (value === before[position] ? 1 : 0),
    0,
  );
  return matched === before.length;
}

function alertingRank(value) {
  return ALERTING.indexOf(
    String(value ?? 'error')
      .trim()
      .toLowerCase(),
  );
}

function loosens(key, before, after) {
  if (key === 'layers') {
    return !keepsOrder(listOf(before), listOf(after));
  }
  if (NARROWED_BY_REMOVAL.has(key)) {
    return listOf(before).some((entry) => !listOf(after).includes(entry));
  }
  if (WIDENED_BY_ADDITION.has(key)) {
    return listOf(after).some((entry) => !listOf(before).includes(entry));
  }
  if (key === 'unmatched_ignore_imports_alerting') {
    return alertingRank(after) < alertingRank(before);
  }
  if (LOOSENED_WHEN_ON.has(key)) {
    return isOn(after, false) && !isOn(before, false);
  }
  if (Object.hasOwn(LOOSENED_WHEN_OFF, key)) {
    const fallback = LOOSENED_WHEN_OFF[key];
    return !isOn(after, fallback) && isOn(before, fallback);
  }
  return !NEUTRAL.has(key);
}

function entry(text, loosened, file) {
  return loosened ? { loosened: { text, kind: KIND, files: [file] } } : { changed: text };
}

function optionChanges(label, { base, head, file }) {
  const keys = [...new Set([...Object.keys(base), ...Object.keys(head)])].toSorted();
  return keys
    .filter((key) => JSON.stringify(base[key]) !== JSON.stringify(head[key]))
    .map((key) =>
      entry(
        `${label} ${key}: ${shownSetting(base[key])} -> ${shownSetting(head[key])}`,
        loosens(key, base[key], head[key]),
        file,
      ),
    );
}

function contractChanges(base, head) {
  const before = new Map(base.contracts.map(({ id, options }) => [id, options]));
  const after = new Map(head.contracts.map(({ id, options }) => [id, options]));
  return [...new Set([...before.keys(), ...after.keys()])].toSorted().flatMap((id) => {
    const label = `import-linter contract ${id}`;
    if (!after.has(id)) {
      return [entry(`${label} removed`, true, head.file)];
    }
    if (!before.has(id)) {
      return [entry(`${label} added`, false, head.file)];
    }
    return optionChanges(label, { base: before.get(id), head: after.get(id), file: head.file });
  });
}

export function importLinterChanges({ base, head }) {
  if (head === undefined) {
    return base === undefined
      ? []
      : [entry(`import-linter contracts removed: ${base.file}`, true, base.file)];
  }
  if (base === undefined) {
    return [entry(`import-linter contracts added: ${head.file}`, false, head.file)];
  }
  return [
    ...(base.file === head.file
      ? []
      : [entry(`import-linter contracts moved: ${base.file} -> ${head.file}`, false, head.file)]),
    ...optionChanges('import-linter', { base: base.session, head: head.session, file: head.file }),
    ...contractChanges(base, head),
  ];
}
