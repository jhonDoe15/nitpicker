import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const BUILD_FILES = [
  'build.gradle',
  'build.gradle.kts',
  'settings.gradle',
  'settings.gradle.kts',
  'gradle/libs.versions.toml',
];
const DETEKT_CONFIGS = ['config/detekt/detekt', 'config/detekt', 'detekt'].flatMap((base) => [
  `${base}.yml`,
  `${base}.yaml`,
]);
const EDITORCONFIG = '.editorconfig';
const SPOTLESS_SCRIPT_BLOCK = 'kotlinGradle';

function readIfExists(projectRoot, relative) {
  const absolute = path.join(projectRoot, relative);
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : '';
}

function withoutComments(text) {
  return text.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/(^|\s)\/\/.*$/gm, '$1');
}

function blockEnd(text, from) {
  let depth = 1;
  let index = from;
  while (index < text.length && depth > 0) {
    depth += { '{': 1, '}': -1 }[text[index]] ?? 0;
    index += 1;
  }
  return index;
}

function withoutBlocks(text, name) {
  const opener = new RegExp(String.raw`\b${name}\s*\{`, 'g');
  const kept = [];
  let from = 0;
  for (let match = opener.exec(text); match !== null; match = opener.exec(text)) {
    kept.push(text.slice(from, match.index));
    from = blockEnd(text, match.index + match[0].length);
    opener.lastIndex = from;
  }
  return [...kept, text.slice(from)].join('');
}

export function buildText(projectRoot) {
  return withoutBlocks(
    withoutComments(BUILD_FILES.map((file) => readIfExists(projectRoot, file)).join('\n')),
    SPOTLESS_SCRIPT_BLOCK,
  ).toLowerCase();
}

export function detectFormatter({ build, editorconfig }) {
  if (build.includes('ktlint')) {
    return 'ktlint';
  }
  if (build.includes('ktfmt')) {
    return 'ktfmt';
  }
  return editorconfig.includes('ktlint_') ? 'ktlint' : 'none';
}

export function ktfmtStyle(build) {
  if (build.includes('kotlinlangstyle')) {
    return 'kotlinlang';
  }
  return build.includes('googlestyle') ? 'google' : 'meta';
}

function detektConfigOf(projectRoot, configured, snapshot) {
  if (configured === undefined) {
    return DETEKT_CONFIGS.find((candidate) => existsSync(path.join(projectRoot, candidate)));
  }
  if (!existsSync(path.join(projectRoot, configured))) {
    if (snapshot === 'base') {
      return undefined;
    }
    throw new Error(`"kotlin.detektConfig" is ${configured}, which does not exist`);
  }
  return configured;
}

export function resolveKotlinTools(projectRoot, { formatter, detektConfig, snapshot } = {}) {
  const build = buildText(projectRoot);
  const editorconfig = readIfExists(projectRoot, EDITORCONFIG);
  return {
    formatter: formatter ?? detectFormatter({ build, editorconfig }),
    ktfmtStyle: ktfmtStyle(build),
    editorconfig: existsSync(path.join(projectRoot, EDITORCONFIG)),
    detektConfig: detektConfigOf(projectRoot, detektConfig, snapshot),
  };
}

export function kotlinGradleArguments(projectRoot, options) {
  const tools = resolveKotlinTools(projectRoot, options);
  return [
    '-Pnitpicker.kotlin=true',
    `-Pnitpicker.kotlin.formatter=${tools.formatter}`,
    `-Pnitpicker.kotlin.ktfmtStyle=${tools.ktfmtStyle}`,
    ...(tools.editorconfig ? ['-Pnitpicker.kotlin.editorconfig=true'] : []),
    ...(tools.detektConfig === undefined
      ? []
      : [`-Pnitpicker.kotlin.detektConfig=${path.join(projectRoot, tools.detektConfig)}`]),
  ];
}
