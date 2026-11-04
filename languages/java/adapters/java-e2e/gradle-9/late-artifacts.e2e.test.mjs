import { appendFileSync, cpSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../java-diff.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const GRADLE_9 = '9.5.1';
const fixture = path.join(import.meta.dirname, '../../fixtures/gradle-project');
const LATE_ARTIFACT = `
def notice = tasks.register('generateNotice') {
    def file = layout.buildDirectory.file('notice/NOTICE.txt')
    outputs.file(file)
    doLast { file.get().asFile.text = 'notice\\n' }
}
configurations {
    noticeElements {
        canBeResolved = false
        attributes { attribute(Usage.USAGE_ATTRIBUTE, objects.named(Usage, 'notice')) }
    }
    notices {
        canBeConsumed = false
        attributes { attribute(Usage.USAGE_ATTRIBUTE, objects.named(Usage, 'notice')) }
    }
}
dependencies { notices project(path: ':', configuration: 'noticeElements') }
tasks.named('processResources') { from(configurations.notices) }
afterEvaluate {
    artifacts { noticeElements(notice) }
}
`;
const temporary = [];

function projectOf() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-late-artifacts-'));
  temporary.push(root);
  cpSync(fixture, root, { recursive: true });
  appendFileSync(path.join(root, 'build.gradle'), LATE_ARTIFACT);
  return root;
}

function withGradle9Wrapper(project) {
  const result = spawnSync(
    gradle,
    ['--quiet', '--no-configuration-cache', 'wrapper', '--gradle-version', GRADLE_9],
    { cwd: project, encoding: 'utf8', timeout: 120_000 },
  );
  if (result.status !== 0) {
    throw new Error(`gradle wrapper failed:\n${result.stdout}${result.stderr}`);
  }
  return project;
}

const comparable = (findings) =>
  findings
    .filter(({ tool }) => tool !== 'test-runtime')
    .map(({ tool, rule, path: file, message }) => JSON.stringify({ tool, rule, file, message }))
    .sort();

afterAll(() => {
  for (const root of temporary.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe.skipIf(!enabled)(
  'Java preset on a build whose plugin adds artifacts in afterEvaluate',
  () => {
    const runs = {};
    beforeAll(() => {
      runs.gradle9 = collectJavaFindings(withGradle9Wrapper(projectOf()), { policy: {} });
    }, 300_000);
    beforeAll(() => {
      runs.pinned = collectJavaFindings(projectOf(), { gradle, policy: {} });
    }, 180_000);

    it('runs every tool on Gradle 9, where resolving such a build while it configures is an error', () => {
      expect(runs.gradle9.filter(({ classification }) => classification === 'tool-error')).toEqual(
        [],
      );
      expect(runs.gradle9.some(({ tool }) => tool === 'pit')).toBe(true);
    });

    it('reports what the pinned Gradle reports on the same build', () => {
      expect(comparable(runs.gradle9)).toEqual(comparable(runs.pinned));
    });
  },
);
