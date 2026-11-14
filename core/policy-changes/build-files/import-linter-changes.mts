import { shownSetting as untypedShownSetting } from '../../../shared/config.mjs';
import { changedKeys } from '../../../shared/values/changed-keys.mts';
import type {
  FileChange,
  ImportLinterConfig,
  ImportLinterOptions,
} from '../types/policy-types.mts';

type OptionValue = ImportLinterOptions[string];

const shownSetting: (value: unknown) => string = untypedShownSetting;

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
const LOOSENED_WHEN_OFF: Readonly<Record<string, boolean>> = {
  exhaustive: false,
  as_packages: true,
};

function listOf(value: OptionValue): string[] {
  return [value ?? []].flat();
}

function isOn(value: OptionValue, fallback: boolean): boolean {
  return value === undefined ? fallback : String(value).trim().toLowerCase() === 'true';
}

function keepsOrder(before: readonly string[], after: readonly string[]): boolean {
  const matched = after.reduce(
    (position, value) => position + (value === before[position] ? 1 : 0),
    0,
  );
  return matched === before.length;
}

function alertingRank(value: OptionValue): number {
  return ALERTING.indexOf(
    String(value ?? 'error')
      .trim()
      .toLowerCase(),
  );
}

function loosens(key: string, before: OptionValue, after: OptionValue): boolean {
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
    const fallback = LOOSENED_WHEN_OFF[key] ?? false;
    return !isOn(after, fallback) && isOn(before, fallback);
  }
  return !NEUTRAL.has(key);
}

function entry(text: string, loosened: boolean, file: string): FileChange {
  return loosened ? { loosened: { text, kind: KIND, files: [file] } } : { changed: text };
}

function optionChanges(
  label: string,
  { base, head, file }: { base: ImportLinterOptions; head: ImportLinterOptions; file: string },
): FileChange[] {
  return changedKeys(base, head).map((key) =>
    entry(
      `${label} ${key}: ${shownSetting(base[key])} -> ${shownSetting(head[key])}`,
      loosens(key, base[key], head[key]),
      file,
    ),
  );
}

function contractChanges(base: ImportLinterConfig, head: ImportLinterConfig): FileChange[] {
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
    return optionChanges(label, {
      base: before.get(id) ?? {},
      head: after.get(id) ?? {},
      file: head.file,
    });
  });
}

export function importLinterChanges({
  base,
  head,
}: {
  base: ImportLinterConfig | undefined;
  head: ImportLinterConfig | undefined;
}): FileChange[] {
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
