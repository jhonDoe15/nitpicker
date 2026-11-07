import { firstProjectFile, readInside } from '../../../../shared/conventions/read-inside.mjs';

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

function optionValue(tokens, name) {
  const index = tokens.findLastIndex((token) => token === name || token.startsWith(`${name}=`));
  if (index === -1) {
    return undefined;
  }
  return tokens[index].includes('=') ? tokens[index].slice(name.length + 1) : tokens[index + 1];
}

function sourceFile(projectRoot, tokens, { option, defaults }) {
  if (tokens.includes(`--no-${option}`)) {
    return undefined;
  }
  return optionValue(tokens, `--${option}`) ?? firstProjectFile(projectRoot, defaults);
}

export function mochaSources(projectRoot, tokens = []) {
  return {
    config: sourceFile(projectRoot, tokens, { option: 'config', defaults: MOCHA_RC_FILES }),
    package: sourceFile(projectRoot, tokens, { option: 'package', defaults: [PACKAGE_JSON] }),
  };
}

function manifestOf(projectRoot, file) {
  const text = readInside(projectRoot, file, 'utf8');
  try {
    return { manifest: JSON.parse(text) };
  } catch (error) {
    return { malformed: error.message };
  }
}

function hasMochaKey(projectRoot, file) {
  return manifestOf(projectRoot, file).manifest?.mocha !== undefined;
}

export function mochaConfigFiles(projectRoot, tokens = []) {
  const { config, package: manifest } = mochaSources(projectRoot, tokens);
  return [
    ...(config === undefined ? [] : [{ file: config, label: config }]),
    ...(manifest !== undefined && hasMochaKey(projectRoot, manifest)
      ? [{ file: manifest, label: `${manifest} "mocha"` }]
      : []),
  ];
}
