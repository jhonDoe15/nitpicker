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
const FIXTURE = path.join(FIXTURES, 'kotlin-reactive-fan-out-project');
const RULE = 'UnboundedReactiveFanOut';
const BASE_FILES = new Set([
  'build.gradle.kts',
  'settings.gradle.kts',
  'src/main/kotlin/shop/Feeds.kt',
]);

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
    readFileSync(path.join(FIXTURES, 'kotlin-reactive-fan-out-facts.json'), 'utf8'),
  );
  return fanOutFindings({ own: files, projectFiles: files, projectRoot: FIXTURE, javaRoots: [] })
    .findings;
}

function reported(findings) {
  return findings
    .filter((finding) => finding.tool === 'kotlin-source' && finding.rule === RULE)
    .toSorted((left, right) => left.location.line - right.location.line)
    .map(({ path: file, location, identity, message }) => ({
      at: `${file}:${String(location.line)}`,
      identity,
      message,
    }));
}

describe.skipIf(!kotlinE2eEnabled)('Kotlin unbounded reactive fan-out end to end', () => {
  let project;
  let result;

  beforeAll(() => {
    project = { root: mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-reactive-fan-out-')) };
    const files = fixtureFiles();
    writeAll(project, {
      '.gitignore': '/build/\n/.gradle/\n/.kotlin/\n',
      ...Object.fromEntries(Object.entries(files).filter(([file]) => BASE_FILES.has(file))),
    });
    git(project, 'init', '-q', '-b', 'main');
    git(project, 'add', '-A');
    git(project, 'commit', '-q', '-m', 'base');
    git(project, 'checkout', '-q', '-b', 'reactive');
    writeAll(project, files);
    git(project, 'add', '-A');
    git(project, 'commit', '-q', '-m', 'reactive');
    result = diffOf(project, 'reactive', { policy: kotlinPolicy });
  });
  afterAll(() => {
    if (project !== undefined) {
      removeProject(project);
    }
  });

  it('reports the recorded fixture findings, with the exception route, from the facts of the build', () => {
    expect(result.failed).toBe(true);
    expect(reported(result.newEnforceable)).toEqual(
      reported(recordedFindings().map((finding) => withKotlinRuleMessage(finding))),
    );
  });
});
