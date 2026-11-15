import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fanOutFindings } from '../test-support/kotlin-fan-out-views.mts';
import { git, writeAll } from '../../__tests__/kotlin-e2e-project.mts';
import type { KotlinProject } from '../../__tests__/kotlin-e2e-project.mts';
import type { Finding } from '../../../../../../shared/values/findings.mts';
import { fieldOf, parseJson } from '../../../../../../shared/values/readers.mts';

export const FIXTURES = path.resolve(import.meta.dirname, '../../../fixtures');

export function fixtureFiles(fixture: string): Record<string, string> {
  return Object.fromEntries(
    readdirSync(fixture, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => path.relative(fixture, path.join(entry.parentPath, entry.name)))
      .map((relative) => [
        relative.replaceAll('\\', '/'),
        readFileSync(path.join(fixture, relative), 'utf8'),
      ]),
  );
}

export function recordedFindingsOf(factsFile: string, fixture: string): Finding[] {
  const files = fieldOf(parseJson(readFileSync(path.join(FIXTURES, factsFile), 'utf8')), 'files');
  return fanOutFindings({ own: files, projectFiles: files, projectRoot: fixture, javaRoots: [] })
    .findings;
}

export function commitFanOutProject(input: {
  readonly prefix: string;
  readonly fixture: string;
  readonly baseFiles: ReadonlySet<string>;
  readonly branch: string;
}): KotlinProject {
  const project = { root: mkdtempSync(path.join(tmpdir(), input.prefix)) };
  const files = fixtureFiles(input.fixture);
  writeAll(project, {
    '.gitignore': '/build/\n/.gradle/\n/.kotlin/\n',
    ...Object.fromEntries(Object.entries(files).filter(([file]) => input.baseFiles.has(file))),
  });
  git(project, 'init', '-q', '-b', 'main');
  git(project, 'add', '-A');
  git(project, 'commit', '-q', '-m', 'base');
  git(project, 'checkout', '-q', '-b', input.branch);
  writeAll(project, files);
  git(project, 'add', '-A');
  git(project, 'commit', '-q', '-m', input.branch);
  return project;
}
