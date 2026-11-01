import { existsSync, readFileSync } from 'node:fs';
import { containedPath } from '../../../../core/fix/common/contained-path.mjs';
import { gradleTokens } from '../../builds/narrowing/gradle-script.mjs';

const SETTINGS_BLOCKS = [['dependencyResolutionManagement', 'repositories']];
const BUILD_BLOCKS = [
  ['repositories'],
  ['allprojects', 'repositories'],
  ['subprojects', 'repositories'],
];
const SOURCES = [
  { name: 'settings.gradle.kts', kotlin: true, blocks: SETTINGS_BLOCKS },
  { name: 'settings.gradle', kotlin: false, blocks: SETTINGS_BLOCKS },
  { name: 'build.gradle.kts', kotlin: true, blocks: BUILD_BLOCKS },
  { name: 'build.gradle', kotlin: false, blocks: BUILD_BLOCKS },
];
const MAVEN_CENTRAL = 'mavenCentral()';

function isTarget(path, blocks) {
  return blocks.some(
    (block) => block.length === path.length && block.every((name, index) => name === path[index]),
  );
}

function openBlock(state, blocks) {
  state.path.push(state.header.trim());
  state.header = '';
  if (isTarget(state.path, blocks)) {
    state.capture = { depth: 1, text: '' };
  }
}

function captureToken(state, token) {
  state.capture.depth += Number(token === '{') - Number(token === '}');
  if (state.capture.depth > 0) {
    state.capture.text += token;
    return;
  }
  state.bodies.push(state.capture.text.trim());
  state.capture = undefined;
  state.path.pop();
}

function consume(state, token, blocks) {
  if (state.capture !== undefined) {
    captureToken(state, token);
  } else if (token === '{') {
    openBlock(state, blocks);
  } else if (token === '}') {
    state.path.pop();
    state.header = '';
  } else {
    state.header = token === '\n' || token === ';' ? '' : state.header + token;
  }
}

export function repositoryBlocks(text, blocks) {
  const state = { path: [], header: '', bodies: [], capture: undefined };
  for (const token of gradleTokens(text)) {
    consume(state, token, blocks);
  }
  return state.bodies.filter((body) => body !== '');
}

function declared(projectRoot) {
  return SOURCES.flatMap(({ name, kotlin, blocks }) => {
    const file = containedPath(projectRoot, name);
    if (!existsSync(file)) {
      return [];
    }
    const bodies = repositoryBlocks(readFileSync(file, 'utf8'), blocks);
    return bodies.length === 0 ? [] : [{ name, kotlin, bodies }];
  });
}

function indented(bodies) {
  return bodies
    .flatMap((body) => body.split('\n'))
    .map((line) => `        ${line.trim()}`)
    .join('\n');
}

export function resolutionSettings(projectRoot) {
  const found = declared(projectRoot);
  const kotlin = found[0]?.kotlin ?? false;
  const chosen = found.filter((entry) => entry.kotlin === kotlin);
  const bodies =
    chosen.length === 0 ? [MAVEN_CENTRAL] : [...new Set(chosen.flatMap((entry) => entry.bodies))];
  const quote = kotlin ? '"' : "'";
  return {
    file: kotlin ? 'settings.gradle.kts' : 'settings.gradle',
    sources: chosen.map(({ name }) => name),
    text: [
      `rootProject.name = ${quote}nitpicker-fix-tools${quote}`,
      'dependencyResolutionManagement {',
      '    repositories {',
      indented(bodies),
      '    }',
      '}',
      '',
    ].join('\n'),
  };
}
