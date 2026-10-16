import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SUPPRESS_WARNINGS = /@\s*(?:java\s*\.\s*lang\s*\.\s*)?SuppressWarnings\s*\([^)]*\)/gu;
const LOMBOK_CONFIG = 'lombok.config';
const STOP_BUBBLING = 'config.stopBubbling = true\n';
const STOPS_BUBBLING = /^\s*config\.stopBubbling\s*=\s*true\s*$/mu;

export function blankSuppressions(text) {
  return text.replaceAll(SUPPRESS_WARNINGS, (match) => match.replaceAll(/[^\n]/gu, ' '));
}

function directoriesUpTo(root, directory) {
  const relative = path.relative(root, directory);
  const parts = relative === '' ? [] : relative.split(path.sep);
  return parts.map((_, index) => path.join(root, ...parts.slice(0, index + 1)));
}

function ancestorsOf(directory) {
  const { root } = path.parse(directory);
  const parts = path.relative(root, directory).split(path.sep).filter(Boolean);
  return parts.map((_, index) => path.join(root, ...parts.slice(0, parts.length - 1 - index)));
}

function configText(directory) {
  const file = path.join(directory, LOMBOK_CONFIG);
  return existsSync(file) ? `${readFileSync(file, 'latin1')}\n` : '';
}

export function rootLombokConfig(root) {
  const texts = [root, ...ancestorsOf(root)].map((directory) => configText(directory));
  const stop = texts.findIndex((text) => STOPS_BUBBLING.test(text));
  return (stop < 0 ? texts : texts.slice(0, stop + 1)).reverse().join('');
}

export function lombokConfigs({ root, sources }) {
  const directories = new Set([
    root,
    ...sources.flatMap((source) => directoriesUpTo(root, path.dirname(source))),
  ]);
  return [...directories]
    .map((directory) => path.join(directory, LOMBOK_CONFIG))
    .filter((config) => existsSync(config))
    .sort();
}

function copyLombokConfigs({ root, sources, staged }) {
  const rootConfig = path.join(root, LOMBOK_CONFIG);
  for (const config of lombokConfigs({ root, sources }).filter((file) => file !== rootConfig)) {
    copyFileSync(config, path.join(staged, path.relative(root, config)));
  }
  writeFileSync(
    path.join(staged, LOMBOK_CONFIG),
    `${rootLombokConfig(root)}${STOP_BUBBLING}`,
    'latin1',
  );
}

export function stageSources({ root, sources, staged }) {
  mkdirSync(staged, { recursive: true });
  const files = sources.map((source) => {
    const target = path.join(staged, path.relative(root, source));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, blankSuppressions(readFileSync(source, 'latin1')), 'latin1');
    return target;
  });
  copyLombokConfigs({ root, sources, staged });
  return files;
}
