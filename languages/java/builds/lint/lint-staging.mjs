import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SUPPRESS_WARNINGS = /@\s*(?:java\s*\.\s*lang\s*\.\s*)?SuppressWarnings\s*\([^)]*\)/gu;
const LOMBOK_CONFIG = 'lombok.config';
const STOP_BUBBLING = 'config.stopBubbling = true\n';

export function blankSuppressions(text) {
  return text.replaceAll(SUPPRESS_WARNINGS, (match) => match.replaceAll(/[^\n]/gu, ' '));
}

function directoriesUpTo(root, directory) {
  const relative = path.relative(root, directory);
  const parts = relative === '' ? [] : relative.split(path.sep);
  return parts.map((_, index) => path.join(root, ...parts.slice(0, index + 1)));
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
  const top = existsSync(rootConfig) ? `${readFileSync(rootConfig, 'latin1')}\n` : '';
  writeFileSync(path.join(staged, LOMBOK_CONFIG), `${top}${STOP_BUBBLING}`, 'latin1');
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
