import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type {
  Annotation,
  JavaClass,
  JavaField,
  LombokConfig,
  LombokContext,
  MemberKind,
} from './member-types.mts';

type MemberSpec = {
  annotation: string;
  label: string;
  exclude: string;
  allowed: string;
  declared: [string, number][];
  configKey: string | undefined;
  skips: (field: JavaField) => boolean;
};

const LOMBOK = 'lombok';
const DATA_ANNOTATIONS = new Set(['Data', 'Value']);
const LOMBOK_IMPORT = /^\s*import\s+lombok\.(\*|[A-Za-z_$][\w$]*)\s*;/gmu;
const ARGUMENT = /([A-Za-z_$][\w$]*)\s*=\s*(\{[^{}]*\}|[^,]+)/gu;
const STRING = /"((?:\\.|[^"\\])*)"/gu;
const CONFIG_LINE = /^\s*([\w.]+)\s*=\s*(\S+)\s*$/u;
const STOP_BUBBLING = 'config.stopbubbling';
const CALL_SUPER_KEY = 'lombok.equalsandhashcode.callsuper';
const ONLY_INCLUDED_TO_STRING_KEY = 'lombok.tostring.onlyexplicitlyincluded';

export const MEMBERS: Record<MemberKind, MemberSpec> = {
  toString: {
    annotation: 'ToString',
    label: 'toString',
    exclude: 'ToString.Exclude',
    allowed: '@ToString.Exclude',
    declared: [['toString', 0]],
    configKey: ONLY_INCLUDED_TO_STRING_KEY,
    skips: (field) => field.modifiers.includes('static'),
  },
  equals: {
    annotation: 'EqualsAndHashCode',
    label: 'equals and hashCode',
    exclude: 'EqualsAndHashCode.Exclude',
    allowed: '@EqualsAndHashCode.Exclude',
    declared: [
      ['equals', 1],
      ['hashCode', 0],
    ],
    configKey: undefined,
    skips: (field) => field.modifiers.includes('static') || field.modifiers.includes('transient'),
  },
};

export function lombokImports(raw: string): Set<string> {
  return new Set([...raw.matchAll(LOMBOK_IMPORT)].map(([, name = '']) => name));
}

function lombokName(annotation: Annotation, imported: Set<string>): string | undefined {
  const parts = annotation.name.split('.');
  const first = parts[0] ?? '';
  if (first === LOMBOK) {
    return parts.slice(1).join('.');
  }
  return imported.has(first) || imported.has('*') ? annotation.name : undefined;
}

function lombokAnnotation(
  annotations: Annotation[],
  name: string,
  imported: Set<string>,
): Annotation | undefined {
  return annotations.find((annotation) => lombokName(annotation, imported) === name);
}

function annotationArguments(annotation: Annotation | undefined, raw: string): Map<string, string> {
  if (annotation?.argumentsStart === undefined) {
    return new Map();
  }
  const text = raw.slice(annotation.argumentsStart, annotation.argumentsEnd);
  return new Map(
    [...text.matchAll(ARGUMENT)].map(([, key = '', value = '']): [string, string] => [
      key,
      value.trim(),
    ]),
  );
}

function names(value: string | undefined): string[] | undefined {
  return value === undefined ? undefined : [...value.matchAll(STRING)].map(([, name = '']) => name);
}

function declares(klass: JavaClass, declared: [string, number][]): boolean {
  return declared.some(([name, parameters]) =>
    klass.methods.some((method) => method.name === name && method.parameters === parameters),
  );
}

export function generatedMember(
  klass: JavaClass,
  kind: MemberKind,
  { raw, imported, config }: LombokContext,
): ((field: JavaField) => boolean) | undefined {
  const member = MEMBERS[kind];
  const own = lombokAnnotation(klass.annotations, member.annotation, imported);
  const data = [...DATA_ANNOTATIONS].some(
    (name) => lombokAnnotation(klass.annotations, name, imported) !== undefined,
  );
  if ((own === undefined && !data) || klass.kind !== 'class' || declares(klass, member.declared)) {
    return undefined;
  }
  const settings = annotationArguments(own, raw);
  const only =
    settings.get('onlyExplicitlyIncluded') === 'true' ||
    (member.configKey !== undefined && config(member.configKey) === 'true');
  const listed = names(settings.get('of'));
  const excluded = new Set(names(settings.get('exclude')) ?? []);
  function hasFieldAnnotation(field: JavaField, suffix: string): boolean {
    return field.annotations.some(
      (annotation) => lombokName(annotation, imported) === `${member.annotation}.${suffix}`,
    );
  }
  return (field) => {
    if (member.skips(field) || field.name.startsWith('$') || excluded.has(field.name)) {
      return false;
    }
    if (listed !== undefined) {
      return listed.includes(field.name);
    }
    if (only) {
      return hasFieldAnnotation(field, 'Include');
    }
    return !hasFieldAnnotation(field, 'Exclude');
  };
}

export function equalsWithoutSuper(
  klass: JavaClass,
  { raw, imported, config }: LombokContext,
): boolean {
  if (klass.kind !== 'class' || klass.extendsName === undefined) {
    return false;
  }
  const own = lombokAnnotation(klass.annotations, MEMBERS.equals.annotation, imported);
  if (own !== undefined && annotationArguments(own, raw).has('callSuper')) {
    return false;
  }
  return (
    generatedMember(klass, 'equals', { raw, imported, config }) !== undefined &&
    config(CALL_SUPER_KEY) === undefined
  );
}

function readConfig(file: string): Map<string, string> {
  const settings = new Map<string, string>();
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/u)) {
    const match = CONFIG_LINE.exec(line.replace(/#.*$/u, ''));
    if (match !== null) {
      settings.set((match[1] ?? '').toLowerCase(), (match[2] ?? '').toLowerCase());
    }
  }
  return settings;
}

export function lombokConfig(projectRoot: string): (sourceFile: string) => LombokConfig {
  const byDirectory = new Map<string, Map<string, string>>();
  function settingsIn(directory: string): Map<string, string> {
    if (!byDirectory.has(directory)) {
      const file = path.join(directory, 'lombok.config');
      byDirectory.set(directory, existsSync(file) ? readConfig(file) : new Map<string, string>());
    }
    return byDirectory.get(directory) ?? new Map<string, string>();
  }
  const root = path.resolve(projectRoot);
  return (sourceFile) => {
    const directories = [path.dirname(path.resolve(root, sourceFile))];
    for (const directory of directories) {
      const parent = path.dirname(directory);
      const stops = settingsIn(directory).get(STOP_BUBBLING) === 'true';
      if (!stops && directory !== root && parent !== directory) {
        directories.push(parent);
      }
    }
    return (key) =>
      directories
        .map(settingsIn)
        .find((settings) => settings.has(key))
        ?.get(key);
  };
}
