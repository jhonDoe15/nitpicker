import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const LOMBOK = 'lombok';
const DATA_ANNOTATIONS = new Set(['Data', 'Value']);
const LOMBOK_IMPORT = /^\s*import\s+lombok\.(\*|[A-Za-z_$][\w$]*)\s*;/gmu;
const ARGUMENT = /([A-Za-z_$][\w$]*)\s*=\s*(\{[^{}]*\}|[^,]+)/gu;
const STRING = /"((?:\\.|[^"\\])*)"/gu;
const CONFIG_LINE = /^\s*([\w.]+)\s*=\s*(\S+)\s*$/u;
const STOP_BUBBLING = 'config.stopbubbling';
export const CALL_SUPER_KEY = 'lombok.equalsandhashcode.callsuper';
const ONLY_INCLUDED_TO_STRING_KEY = 'lombok.tostring.onlyexplicitlyincluded';

export const MEMBERS = {
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

export function lombokImports(raw) {
  return new Set([...raw.matchAll(LOMBOK_IMPORT)].map(([, name]) => name));
}

function lombokName(annotation, imported) {
  const parts = annotation.name.split('.');
  if (parts[0] === LOMBOK) {
    return parts.slice(1).join('.');
  }
  return imported.has(parts[0]) || imported.has('*') ? annotation.name : undefined;
}

export function lombokAnnotation(annotations, name, imported) {
  return annotations.find((annotation) => lombokName(annotation, imported) === name);
}

export function annotationArguments(annotation, raw) {
  if (annotation?.argumentsStart === undefined) {
    return new Map();
  }
  const text = raw.slice(annotation.argumentsStart, annotation.argumentsEnd);
  return new Map([...text.matchAll(ARGUMENT)].map(([, key, value]) => [key, value.trim()]));
}

function names(value) {
  return value === undefined ? undefined : [...value.matchAll(STRING)].map(([, name]) => name);
}

function declares(klass, declared) {
  return declared.some(([name, parameters]) =>
    klass.methods.some((method) => method.name === name && method.parameters === parameters),
  );
}

export function generatedMember(klass, kind, { raw, imported, config }) {
  const member = MEMBERS[kind];
  const own = lombokAnnotation(klass.annotations, member.annotation, imported);
  const data = [...DATA_ANNOTATIONS].some((name) =>
    lombokAnnotation(klass.annotations, name, imported),
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
  function hasFieldAnnotation(field, suffix) {
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

export function equalsWithoutSuper(klass, { raw, imported, config }) {
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

function readConfig(file) {
  const settings = new Map();
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/u)) {
    const match = CONFIG_LINE.exec(line.replace(/#.*$/u, ''));
    if (match !== null) {
      settings.set(match[1].toLowerCase(), match[2].toLowerCase());
    }
  }
  return settings;
}

export function lombokConfig(projectRoot) {
  const byDirectory = new Map();
  function settingsIn(directory) {
    if (!byDirectory.has(directory)) {
      const file = path.join(directory, 'lombok.config');
      byDirectory.set(directory, existsSync(file) ? readConfig(file) : new Map());
    }
    return byDirectory.get(directory);
  }
  const root = path.resolve(projectRoot);
  return (sourceFile) => (key) => {
    let directory = path.dirname(path.resolve(root, sourceFile));
    for (;;) {
      const settings = settingsIn(directory);
      if (settings.has(key)) {
        return settings.get(key);
      }
      const parent = path.dirname(directory);
      if (settings.get(STOP_BUBBLING) === 'true' || directory === root || parent === directory) {
        return undefined;
      }
      directory = parent;
    }
  };
}
