import { existsSync, readFileSync } from 'node:fs';
import { containedPath } from '../../../../core/fix/common/contained-path.mjs';
import { gradleTokens } from '../../builds/narrowing/gradle-script.mts';
import { textsOf } from '../../../../shared/values/readers.mts';

type Blocks = readonly (readonly string[])[];
type ParseState = {
  readonly path: string[];
  header: string;
  readonly bodies: string[];
  capture: Capture | undefined;
};
type Capture = { depth: number; text: string };
type Declared = { readonly name: string; readonly kotlin: boolean; readonly bodies: string[] };
type ResolutionSettings = {
  readonly file: string;
  readonly sources: string[];
  readonly text: string;
};

const SETTINGS_BLOCKS: Blocks = [['dependencyResolutionManagement', 'repositories']];
const BUILD_BLOCKS: Blocks = [
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

function isTarget(path: readonly string[], blocks: Blocks): boolean {
  return blocks.some(
    (block) => block.length === path.length && block.every((name, index) => name === path[index]),
  );
}

function openBlock(state: ParseState, blocks: Blocks): void {
  state.path.push(state.header.trim());
  state.header = '';
  if (isTarget(state.path, blocks)) {
    state.capture = { depth: 1, text: '' };
  }
}

function captureToken(state: ParseState, capture: Capture, token: string): void {
  capture.depth += Number(token === '{') - Number(token === '}');
  if (capture.depth > 0) {
    capture.text += token;
    return;
  }
  state.bodies.push(capture.text.trim());
  state.capture = undefined;
  state.path.pop();
}

function consume(state: ParseState, token: string, blocks: Blocks): void {
  if (state.capture !== undefined) {
    captureToken(state, state.capture, token);
  } else if (token === '{') {
    openBlock(state, blocks);
  } else if (token === '}') {
    state.path.pop();
    state.header = '';
  } else {
    state.header = token === '\n' || token === ';' ? '' : state.header + token;
  }
}

export function repositoryBlocks(text: string, blocks: Blocks): string[] {
  const state: ParseState = { path: [], header: '', bodies: [], capture: undefined };
  for (const token of textsOf(gradleTokens(text))) {
    consume(state, token, blocks);
  }
  return state.bodies.filter((body) => body !== '');
}

function declared(projectRoot: string): Declared[] {
  return SOURCES.flatMap(({ name, kotlin, blocks }): Declared[] => {
    const file: string = containedPath(projectRoot, name);
    if (!existsSync(file)) {
      return [];
    }
    const bodies = repositoryBlocks(readFileSync(file, 'utf8'), blocks);
    return bodies.length === 0 ? [] : [{ name, kotlin, bodies }];
  });
}

function indented(bodies: readonly string[]): string {
  return bodies
    .flatMap((body) => body.split('\n'))
    .map((line) => `        ${line.trim()}`)
    .join('\n');
}

export function resolutionSettings(projectRoot: string): ResolutionSettings {
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
