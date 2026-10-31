import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fanOutFindings } from '../../kotlin/review-rules/main/fan-out/fan-out.mjs';
import { withKotlinRuleMessage } from '../../kotlin/rules/kotlin-messages.mjs';
import {
  diffOf,
  git,
  kotlinE2eEnabled,
  kotlinPolicy,
  removeProject,
  writeAll,
} from '../test-support/kotlin-e2e-project.mjs';

const FIXTURES = path.resolve(import.meta.dirname, '../../fixtures');
const FIXTURE = path.join(FIXTURES, 'kotlin-fan-out-project');
const SHOP = 'src/main/kotlin/shop';
const BASE_FILES = new Set([
  'build.gradle.kts',
  'settings.gradle.kts',
  `${SHOP}/Pages.kt`,
  `${SHOP}/Downloads.kt`,
]);
const UNBOUNDED = `${SHOP}/Unbounded.kt`;
const BOUNDED = `${SHOP}/Bounded.kt`;

function fixtureFiles() {
  return Object.fromEntries(
    readdirSync(FIXTURE, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => path.relative(FIXTURE, path.join(entry.parentPath, entry.name)))
      .map((relative) => [
        relative.replaceAll('\\', '/'),
        readFileSync(path.join(FIXTURE, relative), 'utf8'),
      ]),
  );
}

function recordedFindings() {
  const { files } = JSON.parse(
    readFileSync(path.join(FIXTURES, 'kotlin-fan-out-facts.json'), 'utf8'),
  );
  return fanOutFindings({ own: files, projectFiles: files, projectRoot: FIXTURE, javaRoots: [] })
    .findings;
}

function lines(findings, rule) {
  return findings
    .filter((finding) => finding.tool === 'kotlin-source' && finding.rule === rule)
    .map(({ path: file, location, identity }) => `${file}:${String(location.line)} ${identity}`)
    .sort();
}

function lineOf(file, fragment) {
  const text = readFileSync(path.join(FIXTURE, file), 'utf8').split('\n');
  return text.findIndex((line) => line.includes(fragment)) + 1;
}

describe.skipIf(!kotlinE2eEnabled)('Kotlin unbounded fan-out end to end', () => {
  let project;
  let result;

  beforeAll(() => {
    project = { root: mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-fan-out-')) };
    const files = fixtureFiles();
    writeAll(project, {
      '.gitignore': '/build/\n/.gradle/\n/.kotlin/\n',
      ...Object.fromEntries(Object.entries(files).filter(([file]) => BASE_FILES.has(file))),
    });
    git(project, 'init', '-q', '-b', 'main');
    git(project, 'add', '-A');
    git(project, 'commit', '-q', '-m', 'base');
    git(project, 'checkout', '-q', '-b', 'fan-out');
    writeAll(project, files);
    git(project, 'add', '-A');
    git(project, 'commit', '-q', '-m', 'fan-out');
    result = diffOf(project, 'fan-out', { policy: kotlinPolicy });
  });
  afterAll(() => {
    if (project !== undefined) {
      removeProject(project);
    }
  });

  it('reports the recorded fixture findings from the facts of the build', () => {
    expect(result.failed).toBe(true);
    expect(lines(result.newEnforceable, 'UnboundedFanOut')).toEqual(
      lines(recordedFindings(), 'UnboundedFanOut'),
    );
  });

  it('leaves a reported call to the fan-out rule and keeps a bounded per-item call with the loop rule', () => {
    const loops = result.newEnforceable.filter(({ rule }) => rule === 'IoCallInLoop');
    const at = (file, fragment) =>
      loops.some(
        ({ path: found, location }) => found === file && location.line === lineOf(file, fragment),
      );

    expect(at(UNBOUNDED, 'urls.map { async { client.send')).toBe(false);
    expect(at(BOUNDED, 'permits.withPermit { client.send')).toBe(true);
  });

  it('names the exception route that lifts the rule', () => {
    const messages = (findings) =>
      findings
        .filter(({ rule }) => rule === 'UnboundedFanOut')
        .toSorted((left, right) => left.location.line - right.location.line)
        .map(({ message }) => message);

    expect(messages(result.newEnforceable)).toEqual(
      messages(recordedFindings().map((finding) => withKotlinRuleMessage(finding))),
    );
  });
});
