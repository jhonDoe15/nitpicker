import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { writeDetektLists } from '../detekt/detekt-lists.mjs';

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
const BRACE_DELTA = { '{': 1, '}': -1 };

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
  for (const character of text.slice(from)) {
    index += 1;
    depth += BRACE_DELTA[character] ?? 0;
    if (depth === 0) {
      return index;
    }
  }
  return index;
}

function withoutBlocks(text, name) {
  const opener = new RegExp(String.raw`\b${name}\s*\{`, 'g');
  const kept = [];
  let from = 0;
  for (const match of text.matchAll(opener)) {
    if (match.index >= from) {
      kept.push(text.slice(from, match.index));
      from = blockEnd(text, match.index + match[0].length);
    }
  }
  return [...kept, text.slice(from)].join('');
}

function buildText(projectRoot) {
  return withoutBlocks(
    withoutComments(BUILD_FILES.map((file) => readIfExists(projectRoot, file)).join('\n')),
    SPOTLESS_SCRIPT_BLOCK,
  ).toLowerCase();
}

function detectFormatter({ build, editorconfig }) {
  if (build.includes('ktlint')) {
    return 'ktlint';
  }
  if (build.includes('ktfmt')) {
    return 'ktfmt';
  }
  return editorconfig.includes('ktlint_') ? 'ktlint' : 'none';
}

function ktfmtStyle(build) {
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
  const lists =
    tools.detektConfig === undefined
      ? undefined
      : writeDetektLists(projectRoot, path.join(projectRoot, tools.detektConfig));
  return [
    '-Pnitpicker.kotlin=true',
    `-Pnitpicker.kotlin.formatter=${tools.formatter}`,
    `-Pnitpicker.kotlin.ktfmtStyle=${tools.ktfmtStyle}`,
    ...(tools.editorconfig ? ['-Pnitpicker.kotlin.editorconfig=true'] : []),
    ...(tools.detektConfig === undefined
      ? []
      : [`-Pnitpicker.kotlin.detektConfig=${path.join(projectRoot, tools.detektConfig)}`]),
    ...(lists === undefined ? [] : [`-Pnitpicker.kotlin.detektLists=${lists}`]),
  ];
}
