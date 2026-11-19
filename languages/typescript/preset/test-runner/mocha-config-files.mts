import { messageOf, parseJson, fieldOf } from '../../../../shared/values/readers.mts';
import { firstProjectFile, readInside } from './typed/shared-views.mts';

type SourceOption = { readonly option: string; readonly defaults: readonly string[] };
type ConfigFile = { readonly file: string; readonly label: string };

export const MOCHA_RC_FILES = [
  '.mocharc.cjs',
  '.mocharc.js',
  '.mocharc.mjs',
  '.mocharc.yaml',
  '.mocharc.yml',
  '.mocharc.jsonc',
  '.mocharc.json',
];
export const PACKAGE_JSON = 'package.json';

function optionValue(tokens: readonly string[], name: string): string | undefined {
  const index = tokens.findLastIndex((token) => token === name || token.startsWith(`${name}=`));
  if (index === -1) {
    return undefined;
  }
  const token = tokens[index] ?? '';
  return token.includes('=') ? token.slice(name.length + 1) : tokens[index + 1];
}

function sourceFile(
  projectRoot: string,
  tokens: readonly string[],
  { option, defaults }: SourceOption,
): string | undefined {
  if (tokens.includes(`--no-${option}`)) {
    return undefined;
  }
  return optionValue(tokens, `--${option}`) ?? firstProjectFile(projectRoot, defaults);
}

export function mochaSources(
  projectRoot: string,
  tokens: readonly string[] = [],
): { config: string | undefined; package: string | undefined } {
  return {
    config: sourceFile(projectRoot, tokens, { option: 'config', defaults: MOCHA_RC_FILES }),
    package: sourceFile(projectRoot, tokens, { option: 'package', defaults: [PACKAGE_JSON] }),
  };
}

function manifestOf(projectRoot: string, file: string): { manifest?: unknown; malformed?: string } {
  const text = readInside(projectRoot, file, 'utf8');
  try {
    return { manifest: parseJson(text ?? '') };
  } catch (error) {
    return { malformed: messageOf(error) };
  }
}

function hasMochaKey(projectRoot: string, file: string): boolean {
  return fieldOf(manifestOf(projectRoot, file).manifest, 'mocha') !== undefined;
}

export function mochaConfigFiles(
  projectRoot: string,
  tokens: readonly string[] = [],
): ConfigFile[] {
  const { config, package: manifest } = mochaSources(projectRoot, tokens);
  return [
    ...(config === undefined ? [] : [{ file: config, label: config }]),
    ...(manifest !== undefined && hasMochaKey(projectRoot, manifest)
      ? [{ file: manifest, label: `${manifest} "mocha"` }]
      : []),
  ];
}
