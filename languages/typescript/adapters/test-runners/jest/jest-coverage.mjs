import path from 'node:path';
import { readFileSync } from 'node:fs';
import { coverageGlobs, coverageOutputFile, coverageSourceFiles } from '../test-run.mjs';
import { parseReportJson } from '../../quality-areas/runners/tooling.mjs';
import { formatProcessOutput } from '../../quality-areas/reporting/test-report.mjs';
import {
  TROUBLESHOOTING_ANCHORS,
  troubleshootingError,
} from '../../../../../shared/messages/troubleshooting.mjs';

const SHOWN_CONFIG_START = '{\n  "configs"';
const GLOB_CHARACTERS = /[*?[{]/u;

function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function isOutside(relativePath) {
  return relativePath === '..' || relativePath.startsWith(`..${path.sep}`);
}

function matchesSegment(part, segment) {
  return part === segment || (part !== undefined && GLOB_CHARACTERS.test(part));
}

function strippedGlob(body, rootSegments) {
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

function rebasedBodies(body, { up, down }) {
  const prefixed = path.posix.join(toPosix(up), body);
  if (down === '' || isOutside(down) || path.isAbsolute(down)) {
    return [prefixed];
  }
  const stripped = strippedGlob(body, toPosix(down).split('/'));
  return stripped === undefined ? [prefixed] : [stripped, prefixed];
}

export function rebaseGlobs(globs, { projectRoot, rootDir }) {
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

export function shownRootDir(result) {
  const start = result.stdout.indexOf(SHOWN_CONFIG_START);
  if (result.status !== 0 || start === -1) {
    throw new Error(
      `Jest exited ${String(result.status)} without printing its config for --showConfig${formatProcessOutput(result)}`,
    );
  }
  const { globalConfig } = parseReportJson(result.stdout.slice(start));
  if (typeof globalConfig?.rootDir !== 'string') {
    throw new TypeError('Jest printed a config without a global rootDir for --showConfig');
  }
  return globalConfig.rootDir;
}

export function coverageArguments(options, rootDir) {
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
    ...globs.map((glob) => `--collectCoverageFrom=${glob}`),
  ];
}

export function assertSourcesCovered(options, rootDir) {
  const sources = coverageSourceFiles(options);
  const covered = new Set(
    Object.keys(parseReportJson(readFileSync(coverageOutputFile(options), 'utf8'))),
  );
  if (sources.length === 0 || sources.some((file) => covered.has(file))) {
    return;
  }
  const example = path.relative(options.projectRoot, sources[0]);
  throw troubleshootingError(
    `Jest collected no coverage for the project's source files, such as ${example}. ` +
      'Jest only instruments files inside the rootDir of the config that runs the test ' +
      `(the global rootDir is ${rootDir}). ` +
      "Make the project's Jest config, or each of its projects, use a rootDir that holds the sources.",
    TROUBLESHOOTING_ANCHORS.jestNoCoverage,
  );
}
