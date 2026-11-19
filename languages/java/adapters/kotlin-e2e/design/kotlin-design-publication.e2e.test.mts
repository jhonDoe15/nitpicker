import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from '../../../builds/java-build.mts';
import { writeSources } from '../test-support/views/kotlin-psi-views.mts';
import { assigned } from '../test-support/views/assigned.mts';
import { fieldOf, listOf, textOf } from '../../../../../shared/values/readers.mts';

const enabled = process.env['NITPICKER_KOTLIN_E2E'] === '1';
const gradle = process.env['NITPICKER_GRADLE'] ?? 'gradle';

const fixtureBuild = readFileSync(
  path.resolve(import.meta.dirname, '../../fixtures/kotlin-project/build.gradle.kts'),
  'utf8',
);
const kotlinPlugin = assigned(
  /kotlin\("jvm"\) version "([^"]+)"/u.exec(fixtureBuild)?.[1],
  'kotlin plugin version',
);
const MODULE_BUILD = [
  'plugins {\n    kotlin("jvm")\n}\n',
  'repositories {\n    mavenCentral()\n}\n',
  'kotlin {\n    jvmToolchain(21)\n}\n',
].join('\n');
const PUBLISHING_BUILD = `${MODULE_BUILD.replace('kotlin("jvm")', 'kotlin("jvm")\n    `maven-publish`')}
publishing {
    publications {
        create<MavenPublication>("library") {
            from(components["java"])
        }
    }
}
`;

let workspace: string;

function publishedProject() {
  return writeSources(workspace, 'published', {
    'settings.gradle.kts': 'rootProject.name = "published"\ninclude("lib", "plain")\n',
    'build.gradle.kts': `plugins {\n    kotlin("jvm") version "${kotlinPlugin}" apply false\n}\n`,
    'lib/build.gradle.kts': PUBLISHING_BUILD,
    'plain/build.gradle.kts': MODULE_BUILD,
    'lib/src/main/kotlin/Api.kt': 'package demo.lib\n\nclass Lib\n\nfun top() = Lib()\n',
    'plain/src/main/kotlin/Api.kt': 'package demo.plain\n\nclass Plain\n\nfun top() = Plain()\n',
  });
}

function publishedFlags(project: string, module: string): [string, unknown][] {
  const report = path.join(project, module, 'build/nitpicker/kotlin-facts.json');
  const design = fieldOf(JSON.parse(readFileSync(report, 'utf8')), 'design');
  return [...listOf(fieldOf(design, 'types')), ...listOf(fieldOf(design, 'callables'))].map(
    (item) => [textOf(fieldOf(item, 'id')), fieldOf(item, 'published') ?? false],
  );
}

describe.skipIf(!enabled)('kotlin-psi design facts in a Gradle build with a publication', () => {
  beforeAll(() => {
    workspace = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-psi-published-'));
  });

  afterAll(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it('marks what the module with a publication exports and nothing in the module without one', () => {
    const project = publishedProject();

    const result = spawnSync(
      gradle,
      [
        '--console=plain',
        '--quiet',
        '--no-configuration-cache',
        '-Pnitpicker.kotlin=true',
        '-I',
        INIT_SCRIPT,
        ':lib:nitpickerKotlinPsi',
        ':plain:nitpickerKotlinPsi',
      ],
      { cwd: project, encoding: 'utf8', timeout: 170_000 },
    );

    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect([publishedFlags(project, 'lib'), publishedFlags(project, 'plain')]).toEqual([
      [
        ['lib/src/main/kotlin/Api.kt#Lib', true],
        ['lib/src/main/kotlin/Api.kt', true],
        ['lib/src/main/kotlin/Api.kt#top', true],
      ],
      [
        ['plain/src/main/kotlin/Api.kt#Plain', false],
        ['plain/src/main/kotlin/Api.kt', false],
        ['plain/src/main/kotlin/Api.kt#top', false],
      ],
    ]);
  }, 180_000);
});
