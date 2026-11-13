import path from 'node:path';
import { readFileSync } from 'node:fs';
import { coverageGlobs, coverageOutputFile, coverageSourceFiles } from '../test-run.mts';
import { parseReportJson } from '../../quality-areas/typed/tooling.mts';
import { formatProcessOutput } from '../typed/runner-tools.mts';
import type { TestOptions } from '../typed/runner-types.mts';
import type { NodeToolResult } from '../../static-checks/shared.mts';
import { troubleshootingError } from '../../lint-engine/typed/tools.mts';
import { TROUBLESHOOTING_ANCHORS } from '../../../../../shared/messages/troubleshooting.mjs';
import { fieldOf, fieldsOf, listOf } from '../../../../../shared/values/readers.mts';

const SHOWN_CONFIG_START = '{\n  "configs"';
const GLOB_CHARACTERS = /[*?[{]/u;

function toPosix(relativePath: string): string {
  return relativePath.split(path.sep).join('/');
}

function isOutside(relativePath: string): boolean {
  return relativePath === '..' || relativePath.startsWith(`..${path.sep}`);
}

function matchesSegment(part: string | undefined, segment: string): boolean {
  return part === segment || (part !== undefined && GLOB_CHARACTERS.test(part));
}

function strippedGlob(body: string, rootSegments: readonly string[]): string | undefined {
  const parts = body.split('/');
  for (const [index, segment] of rootSegments.entries()) {
    if (parts[index] === '**') {
      return parts.slice(index).join('/');
    }
    if (!matchesSegment(parts[index], segment)) {
      return undefined;
    }
  }
  const rest = parts.slice(rootSegments.length).join('/');
  return rest === '' ? undefined : rest;
}

function rebasedBodies(
  body: string,
  { up, down }: { readonly up: string; readonly down: string },
): string[] {
  const prefixed = path.posix.join(toPosix(up), body);
  if (down === '' || isOutside(down) || path.isAbsolute(down)) {
    return [prefixed];
  }
  const stripped = strippedGlob(body, toPosix(down).split('/'));
  return stripped === undefined ? [prefixed] : [stripped, prefixed];
}

export function rebaseGlobs(
  globs: readonly string[],
  { projectRoot, rootDir }: { readonly projectRoot: string; readonly rootDir: string },
): readonly string[] {
  const up = path.relative(rootDir, projectRoot);
  if (up === '') {
    return globs;
  }
  const down = path.relative(projectRoot, rootDir);
  return globs.flatMap((glob) => {
    const negation = glob.startsWith('!') ? '!' : '';
    return rebasedBodies(glob.slice(negation.length), { up, down }).map(
      (body) => `${negation}${body}`,
    );
  });
}

export function shownConfig(result: NodeToolResult): {
  readonly rootDir: string;
  readonly printsDirectly: boolean;
} {
  const start = result.stdout.indexOf(SHOWN_CONFIG_START);
  if (result.status !== 0 || start === -1) {
    throw new Error(
      `Jest exited ${String(result.status)} without printing its config for --showConfig${formatProcessOutput(result)}`,
    );
  }
  const shown = parseReportJson(result.stdout.slice(start));
  const configs: unknown = fieldOf(shown, 'configs');
  const globalConfig: unknown = fieldOf(shown, 'globalConfig');
  const rootDir = fieldOf(globalConfig, 'rootDir');
  if (typeof rootDir !== 'string') {
    throw new TypeError('Jest printed a config without a global rootDir for --showConfig');
  }
  const printing = [globalConfig, ...listOf(configs)].some(
    (config) => fieldOf(config, 'silent') === true || fieldOf(config, 'verbose') === true,
  );
  return { rootDir, printsDirectly: printing };
}

export function coverageArguments(options: TestOptions, rootDir: string): string[] {
  const { include, exclude } = coverageGlobs();
  const globs = rebaseGlobs([...include, ...exclude.map((glob) => `!${glob}`)], {
    projectRoot: options.projectRoot,
    rootDir,
  });
  return [
    '--coverage',
    '--coverageProvider=babel',
    '--coverageReporters=json',
    `--coverageDirectory=${path.dirname(coverageOutputFile(options))}`,
    '--coverageThreshold={}',
    '--coveragePathIgnorePatterns=/node_modules/',
    ...globs.map((glob) => `--collectCoverageFrom=${glob}`),
  ];
}

export function assertSourcesCovered(options: TestOptions, rootDir: string): void {
  const sources = coverageSourceFiles(options);
  const covered = new Set(
    Object.keys(fieldsOf(parseReportJson(readFileSync(coverageOutputFile(options), 'utf8')))),
  );
  const missing = sources.filter((file) => !covered.has(file));
  if (missing.length === 0) {
    return;
  }
  const example = path.relative(options.projectRoot, String(missing[0]));
  if (missing.length < sources.length) {
    throw new Error(
      `Jest left source files out of coverage, such as ${example}. ` +
        'Jest does not measure a file that testMatch or testRegex matches, a setup file ' +
        '(setupFiles, setupFilesAfterEnv, globalSetup, globalTeardown), a file in a __mocks__ folder ' +
        'or a file outside the rootDir of every Jest project. ' +
        'Move that code out of the source roots, or add the file to exclude in nitpicker.config.json.',
    );
  }
  throw troubleshootingError(
    `Jest collected no coverage for the project's source files, such as ${example}. ` +
      'Jest only instruments files inside the rootDir of the config that runs the test ' +
      `(the global rootDir is ${rootDir}). ` +
      "Make the project's Jest config, or each of its projects, use a rootDir that holds the sources.",
    TROUBLESHOOTING_ANCHORS.jestNoCoverage,
  );
}
