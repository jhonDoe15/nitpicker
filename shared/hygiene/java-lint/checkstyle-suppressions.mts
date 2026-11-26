import path from 'node:path';
import { attributesOf, propertyValues, xmlFilesMatching } from './xml-files.mts';
import type { XmlFile } from './xml-files.mts';

export type EverywhereSuppression = {
  readonly file: string;
  readonly modules: readonly string[];
  readonly config: string;
};

const EVERY_FILE = new Set(['.', '.*', '.+', '^.*$', '^.+$', '.*$', '.+$', '^.*', '^.+']);
const SUPPRESSION = /<suppress(?=[\s/>])([^>]*?)\/?>/gu;
const MODULE = /<module\s+name="([\w.]+)"\s*(\/>|>)/gu;
const MODULE_END = /<module\b|<\/module>/gu;
const CHECKER = /<module\s+name="Checker"/u;
const SUPPRESSIONS = /<suppressions[\s>]/u;
const NARROWING = ['lines', 'columns', 'message', 'files-not', 'query'];
const SIMPLE_NAME = /^\w+$/u;

type Enabled = { readonly names: ReadonlySet<string>; readonly ids: ReadonlySet<string> };

function simpleName(name: string): string {
  return (name.split('.').at(-1) ?? name).replace(/Check$/u, '');
}

function enabledModules({ file, text }: XmlFile): Map<string, string> {
  const enabled = new Map<string, string>();
  for (const match of text.matchAll(MODULE)) {
    let body = '';
    if (match[2] !== '/>') {
      const start = (match.index ?? 0) + match[0].length;
      MODULE_END.lastIndex = start;
      const end = MODULE_END.exec(text);
      body = end === null ? '' : text.slice(start, end.index);
    }
    const properties = propertyValues(body);
    if (properties.get('severity') !== 'ignore') {
      enabled.set(simpleName(match[1] ?? ''), file);
      const id = properties.get('id');
      if (id !== undefined) {
        enabled.set(`id:${id}`, file);
      }
    }
  }
  return enabled;
}

function referencedSuppressionFiles({ text }: XmlFile): Set<string> {
  const names = new Set<string>();
  for (const match of text.matchAll(
    /<module\s+name="SuppressionFilter"\s*>([\s\S]*?)<\/module>/gu,
  )) {
    const value = propertyValues(match[1] ?? '').get('file');
    if (value !== undefined) {
      names.add(path.posix.basename(value));
    }
  }
  return names;
}

function suppressedModules(attributes: ReadonlyMap<string, string>): string[] {
  const everywhere = EVERY_FILE.has(attributes.get('files') ?? '') && attributes.has('files');
  const narrowed = NARROWING.some((name) => attributes.has(name));
  if (!everywhere || narrowed) {
    return [];
  }
  const checks = (attributes.get('checks') ?? '').split('|').map((item) => item.trim());
  const ids = attributes.has('id') ? [`id:${attributes.get('id') ?? ''}`] : [];
  return [...checks.filter((item) => SIMPLE_NAME.test(item)).map(simpleName), ...ids];
}

type Entry = {
  readonly file: string;
  readonly modules: readonly string[];
  readonly configs: readonly string[];
};

function singleFilterEntries(config: XmlFile): Entry[] {
  return [
    ...config.text.matchAll(/<module\s+name="SuppressionSingleFilter"\s*>([\s\S]*?)<\/module>/gu),
  ].map((match) => ({
    file: config.file,
    modules: suppressedModules(propertyValues(match[1] ?? '')),
    configs: [config.file],
  }));
}

export function everywhereSuppressions(
  projectRoot: string,
  files: readonly string[],
): EverywhereSuppression[] {
  const configs = xmlFilesMatching(projectRoot, files, CHECKER);
  if (configs.length === 0) {
    return [];
  }
  const enabled = new Map(configs.map((config) => [config.file, enabledModules(config)]));
  const referenced = configs.map((config) => ({
    file: config.file,
    names: referencedSuppressionFiles(config),
  }));
  const lists = xmlFilesMatching(projectRoot, files, SUPPRESSIONS).flatMap(({ file, text }) => {
    const owners = referenced
      .filter(({ names }) => names.has(path.posix.basename(file)))
      .map((owner) => owner.file);
    return owners.length === 0
      ? []
      : [...text.matchAll(SUPPRESSION)].map((match) => ({
          file,
          modules: suppressedModules(attributesOf(match[1] ?? '')),
          configs: owners,
        }));
  });
  return [...lists, ...configs.flatMap(singleFilterEntries)].flatMap(
    ({ file, modules, configs: owners }) => {
      const hit = modules.flatMap((name) => {
        const config = owners.map((owner) => enabled.get(owner)?.get(name)).find(Boolean);
        return config === undefined ? [] : [{ name, config }];
      });
      const [first] = hit;
      return first === undefined
        ? []
        : [
            {
              file,
              config: first.config,
              modules: hit.map(({ name }) => name.replace(/^id:/u, '')),
            },
          ];
    },
  );
}
